package com.nexconn.bridge

import ai.nexconn.chat.error.NCError
import ai.nexconn.chat.message.Message
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.concurrent.ConcurrentHashMap

/** Stable wrapper error surfaced to JavaScript as a JSON rejection message. */
internal class BridgeException(
  val category: String,
  override val message: String,
  val code: Int? = null,
  val detail: Any? = null,
) : Exception(message)

internal fun invalidArg(message: String) = BridgeException("invalid_argument", message)

internal fun unsupported(method: String) =
  BridgeException("unsupported", "$method is not available in the Android Nexconn SDK")

/**
 * Generic reflection serializer for Nexconn SDK objects.
 *
 * Every public no-argument `getX()` / `isX()` accessor of an `ai.nexconn.chat`
 * class becomes a JSON field, so new SDK fields reach JavaScript without bridge
 * changes. Enums are emitted as their raw integer value (`getValue()`), which
 * matches the iOS raw values. Each object carries `__type` (simple class name).
 */
internal object NexconnSerializer {
  private const val MAX_DEPTH = 12
  private val accessorCache = ConcurrentHashMap<Class<*>, List<Pair<String, Method>>>()
  private val enumValueCache = ConcurrentHashMap<Class<*>, Method?>()

  /** Types never serialized (platform handles, executors, large blobs). */
  private val skippedReturnTypes = setOf(
    "android.content.Context",
    "java.util.concurrent.Executor",
    "android.graphics.Bitmap",
  )

  /** Accessors that are not data (or would leak internal state). */
  private val skippedAccessors = setOf("getClass", "getCREATOR", "getCallbackExecutor", "getContext")

  var onMessageSerialized: ((Message) -> Unit)? = null

  fun encode(value: Any?): Any = toJson(value, 0)

  fun toJson(value: Any?, depth: Int): Any {
    if (value == null || depth > MAX_DEPTH) return JSONObject.NULL
    return when (value) {
      is String -> value
      is Boolean -> value
      is Int, is Long, is Short, is Byte -> value
      is Float -> if (value.isFinite()) value.toDouble() else JSONObject.NULL
      is Double -> if (value.isFinite()) value else JSONObject.NULL
      is Char -> value.toString()
      is Enum<*> -> enumValue(value)
      is NCError -> JSONObject().put("__type", "NCError").put("code", value.code)
        .put("message", value.message ?: "")
      is Throwable -> JSONObject().put("__type", "Error").put("code", -1)
        .put("message", value.message ?: value.javaClass.simpleName)
      is JSONObject, is JSONArray -> value
      is Map<*, *> -> JSONObject().also { obj ->
        for ((k, v) in value) if (k != null) obj.put(k.toString(), toJson(v, depth + 1))
      }
      is Collection<*> -> JSONArray().also { arr -> value.forEach { arr.put(toJson(it, depth + 1)) } }
      is Array<*> -> JSONArray().also { arr -> value.forEach { arr.put(toJson(it, depth + 1)) } }
      is IntArray -> JSONArray().also { arr -> value.forEach { arr.put(it) } }
      is LongArray -> JSONArray().also { arr -> value.forEach { arr.put(it) } }
      is android.net.Uri -> value.toString()
      is NexconnCustomSlot -> value.toJson(depth)
      is NexconnCustomMediaSlot -> value.toJson(depth)
      else -> {
        if (value is Message) onMessageSerialized?.invoke(value)
        if (value.javaClass.name.startsWith("ai.nexconn.")) reflect(value, depth) else JSONObject.NULL
      }
    }
  }

  private fun reflect(value: Any, depth: Int): JSONObject {
    val obj = JSONObject()
    obj.put("__type", value.javaClass.simpleName)
    for ((name, method) in accessors(value.javaClass)) {
      val result = try {
        method.invoke(value)
      } catch (_: Throwable) {
        continue
      }
      obj.put(name, toJson(result, depth + 1))
    }
    return obj
  }

  private fun accessors(cls: Class<*>): List<Pair<String, Method>> =
    accessorCache.getOrPut(cls) {
      cls.methods
        .filter { m ->
          m.parameterCount == 0 &&
            !Modifier.isStatic(m.modifiers) &&
            m.returnType != Void.TYPE &&
            !m.name.contains('$') &&
            m.declaringClass != Any::class.java &&
            m.name !in skippedAccessors &&
            m.returnType.name !in skippedReturnTypes &&
            !m.isSynthetic &&
            (ACCESSOR.matches(m.name))
        }
        .map { m -> propertyName(m.name) to m }
        .distinctBy { it.first }
        .sortedBy { it.first }
    }

  private val ACCESSOR = Regex("^(get|is)[A-Z].*")

  private fun propertyName(name: String): String =
    if (name.startsWith("is")) {
      name // keep `isPinned` style, matching the iOS property names
    } else {
      val rest = name.removePrefix("get")
      // getIOSConfig -> iOSConfig, getURL -> url, getName -> name
      if (rest.length > 1 && rest[1].isUpperCase() && rest.length > 2 && rest[2].isLowerCase()) {
        rest[0].lowercaseChar() + rest.substring(1)
      } else if (rest.all { it.isUpperCase() }) {
        rest.lowercase()
      } else {
        rest[0].lowercaseChar() + rest.substring(1)
      }
    }

  /** Raw integer value of an SDK enum, aligned with the iOS raw values. */
  fun enumValue(value: Enum<*>): Int {
    val cls: Class<*> = if (value.javaClass.isEnum) value.javaClass else value.javaClass.superclass
    when (cls.simpleName) {
      // No raw value in the Android SDK; iOS uses ban = 1, unban = 0.
      "OpenChannelParticipantBanType" -> return if (value.name == "BAN") 1 else 0
      "LogLevel" -> return value.ordinal
    }
    val getter = enumValueCache.getOrPut(cls) {
      try {
        cls.getMethod("getValue").takeIf { it.returnType == Int::class.javaPrimitiveType }
      } catch (_: NoSuchMethodException) {
        null
      }
    }
    return if (getter != null) (getter.invoke(value) as Int) else value.ordinal
  }

  /** Inverse of [enumValue]. */
  fun <E : Enum<E>> enumFrom(cls: Class<E>, raw: Int, label: String): E =
    cls.enumConstants?.firstOrNull { enumValue(it) == raw }
      ?: throw invalidArg("Invalid $label: $raw")
}

// ---------------------------------------------------------------------------
// JSON argument helpers
// ---------------------------------------------------------------------------

internal fun JSONObject.str(key: String): String? =
  if (has(key) && !isNull(key)) optString(key) else null

internal fun JSONObject.reqStr(key: String): String =
  str(key)?.takeIf { it.isNotEmpty() } ?: throw invalidArg("$key is required")

internal fun JSONObject.int(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null

internal fun JSONObject.reqInt(key: String): Int = int(key) ?: throw invalidArg("$key is required")

internal fun JSONObject.long(key: String): Long? = if (has(key) && !isNull(key)) optLong(key) else null

internal fun JSONObject.double(key: String): Double? =
  if (has(key) && !isNull(key)) optDouble(key) else null

internal fun JSONObject.bool(key: String): Boolean? =
  if (has(key) && !isNull(key)) optBoolean(key) else null

internal fun JSONObject.obj(key: String): JSONObject? = optJSONObject(key)

internal fun JSONObject.reqObj(key: String): JSONObject = obj(key) ?: throw invalidArg("$key is required")

internal fun JSONObject.strings(key: String): List<String>? {
  val arr = optJSONArray(key) ?: return null
  return (0 until arr.length()).mapNotNull { i -> if (arr.isNull(i)) null else arr.optString(i) }
}

internal fun JSONObject.reqStrings(key: String): List<String> =
  strings(key) ?: throw invalidArg("$key is required")

internal fun JSONObject.ints(key: String): List<Int>? {
  val arr = optJSONArray(key) ?: return null
  return (0 until arr.length()).map { arr.optInt(it) }
}

internal fun JSONObject.objects(key: String): List<JSONObject> {
  val arr = optJSONArray(key) ?: return emptyList()
  return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
}

internal fun JSONObject.stringMap(key: String): Map<String, String>? {
  val o = optJSONObject(key) ?: return null
  val out = LinkedHashMap<String, String>()
  for (k in o.keys()) if (!o.isNull(k)) out[k] = o.optString(k)
  return out
}

/** Converts arbitrary JSON (custom message fields) into Kotlin values. */
internal fun jsonToKotlin(value: Any?): Any? = when (value) {
  null, JSONObject.NULL -> null
  is JSONObject -> {
    val out = LinkedHashMap<String, Any?>()
    for (k in value.keys()) out[k] = jsonToKotlin(value.opt(k))
    out
  }
  is JSONArray -> (0 until value.length()).map { jsonToKotlin(value.opt(it)) }
  else -> value
}
