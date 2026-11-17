package com.nexconn.bridge

import ai.nexconn.chat.message.CustomMediaMessageContent
import ai.nexconn.chat.message.CustomMessageContent
import org.json.JSONObject

/**
 * JavaScript cannot define JVM classes, but the Nexconn SDK registers custom
 * messages by class (it instantiates them by reflection and asks the instance
 * for `messageType()`). The bridge therefore ships a fixed pool of generic
 * slot classes; `engine.registerCustomMessages` binds each requested type to a
 * free slot. Fields are carried as a JSON-compatible map.
 */
internal object NexconnCustomRegistry {
  const val SLOT_COUNT = 16

  data class Definition(
    val messageType: String,
    val persistentFlag: Int,
    val searchableFields: List<String>,
    val isMedia: Boolean,
  )

  private val plain = arrayOfNulls<Definition>(SLOT_COUNT)
  private val media = arrayOfNulls<Definition>(SLOT_COUNT)

  @Synchronized
  fun register(def: Definition): Class<*>? {
    val table = if (def.isMedia) media else plain
    val existing = table.indexOfFirst { it?.messageType == def.messageType }
    if (existing >= 0) {
      table[existing] = def
      return null // already registered with the SDK
    }
    val free = table.indexOfFirst { it == null }
    if (free < 0) {
      throw BridgeException(
        "limit_exceeded",
        "At most $SLOT_COUNT ${if (def.isMedia) "media " else ""}custom message types are supported",
      )
    }
    table[free] = def
    return if (def.isMedia) MEDIA_CLASSES[free] else PLAIN_CLASSES[free]
  }

  fun plain(slot: Int): Definition? = plain[slot]

  fun media(slot: Int): Definition? = media[slot]

  @Synchronized
  fun create(messageType: String): Any? {
    plain.indexOfFirst { it?.messageType == messageType }.takeIf { it >= 0 }?.let {
      return PLAIN_CLASSES[it].getDeclaredConstructor().newInstance()
    }
    media.indexOfFirst { it?.messageType == messageType }.takeIf { it >= 0 }?.let {
      return MEDIA_CLASSES[it].getDeclaredConstructor().newInstance()
    }
    return null
  }

  private val PLAIN_CLASSES: List<Class<out NexconnCustomSlot>> = listOf(
    NexconnCustomSlot0::class.java, NexconnCustomSlot1::class.java,
    NexconnCustomSlot2::class.java, NexconnCustomSlot3::class.java,
    NexconnCustomSlot4::class.java, NexconnCustomSlot5::class.java,
    NexconnCustomSlot6::class.java, NexconnCustomSlot7::class.java,
    NexconnCustomSlot8::class.java, NexconnCustomSlot9::class.java,
    NexconnCustomSlot10::class.java, NexconnCustomSlot11::class.java,
    NexconnCustomSlot12::class.java, NexconnCustomSlot13::class.java,
    NexconnCustomSlot14::class.java, NexconnCustomSlot15::class.java,
  )

  private val MEDIA_CLASSES: List<Class<out NexconnCustomMediaSlot>> = listOf(
    NexconnCustomMediaSlot0::class.java, NexconnCustomMediaSlot1::class.java,
    NexconnCustomMediaSlot2::class.java, NexconnCustomMediaSlot3::class.java,
    NexconnCustomMediaSlot4::class.java, NexconnCustomMediaSlot5::class.java,
    NexconnCustomMediaSlot6::class.java, NexconnCustomMediaSlot7::class.java,
    NexconnCustomMediaSlot8::class.java, NexconnCustomMediaSlot9::class.java,
    NexconnCustomMediaSlot10::class.java, NexconnCustomMediaSlot11::class.java,
    NexconnCustomMediaSlot12::class.java, NexconnCustomMediaSlot13::class.java,
    NexconnCustomMediaSlot14::class.java, NexconnCustomMediaSlot15::class.java,
  )
}

private fun searchable(def: NexconnCustomRegistry.Definition?, fields: Map<String, Any?>): List<String> =
  def?.searchableFields?.mapNotNull { fields[it] as? String }?.filter { it.isNotBlank() } ?: emptyList()

abstract class NexconnCustomSlot(private val slot: Int) : CustomMessageContent() {
  var fields: Map<String, Any?> = emptyMap()

  override fun messageType(): String =
    NexconnCustomRegistry.plain(slot)?.messageType ?: "rnnexconn:unregistered$slot"

  override fun persistentFlag(): Int = NexconnCustomRegistry.plain(slot)?.persistentFlag ?: 0

  override fun encodeFields(): Map<String, Any?> = fields

  override fun decodeFields(fields: Map<String, Any?>) {
    this.fields = LinkedHashMap(fields)
  }

  override fun searchableWords(): List<String> = searchable(NexconnCustomRegistry.plain(slot), fields)

  internal fun toJson(depth: Int): JSONObject = JSONObject()
    .put("__type", "CustomMessageContent")
    .put("messageType", messageType())
    .put("fields", NexconnSerializer.toJson(fields, depth + 1))
    .put("extra", extra ?: JSONObject.NULL)
    .put("mentionedInfo", NexconnSerializer.toJson(mentionedInfo, depth + 1))
    .put("senderUserInfo", NexconnSerializer.toJson(senderUserInfo, depth + 1))
}

abstract class NexconnCustomMediaSlot(private val slot: Int) : CustomMediaMessageContent() {
  var fields: Map<String, Any?> = emptyMap()

  override fun messageType(): String =
    NexconnCustomRegistry.media(slot)?.messageType ?: "rnnexconn:unregisteredmedia$slot"

  override fun persistentFlag(): Int = NexconnCustomRegistry.media(slot)?.persistentFlag ?: 0

  override fun encodeFields(): Map<String, Any?> = fields

  override fun decodeFields(fields: Map<String, Any?>) {
    this.fields = LinkedHashMap(fields)
  }

  override fun searchableWords(): List<String> = searchable(NexconnCustomRegistry.media(slot), fields)

  internal fun toJson(depth: Int): JSONObject = JSONObject()
    .put("__type", "CustomMessageContent")
    .put("messageType", messageType())
    .put("fields", NexconnSerializer.toJson(fields, depth + 1))
    .put("localPath", localPath ?: JSONObject.NULL)
    .put("remoteUrl", remoteUrl ?: JSONObject.NULL)
    .put("name", name ?: JSONObject.NULL)
    .put("extra", extra ?: JSONObject.NULL)
}

class NexconnCustomSlot0 : NexconnCustomSlot(0)
class NexconnCustomSlot1 : NexconnCustomSlot(1)
class NexconnCustomSlot2 : NexconnCustomSlot(2)
class NexconnCustomSlot3 : NexconnCustomSlot(3)
class NexconnCustomSlot4 : NexconnCustomSlot(4)
class NexconnCustomSlot5 : NexconnCustomSlot(5)
class NexconnCustomSlot6 : NexconnCustomSlot(6)
class NexconnCustomSlot7 : NexconnCustomSlot(7)
class NexconnCustomSlot8 : NexconnCustomSlot(8)
class NexconnCustomSlot9 : NexconnCustomSlot(9)
class NexconnCustomSlot10 : NexconnCustomSlot(10)
class NexconnCustomSlot11 : NexconnCustomSlot(11)
class NexconnCustomSlot12 : NexconnCustomSlot(12)
class NexconnCustomSlot13 : NexconnCustomSlot(13)
class NexconnCustomSlot14 : NexconnCustomSlot(14)
class NexconnCustomSlot15 : NexconnCustomSlot(15)

class NexconnCustomMediaSlot0 : NexconnCustomMediaSlot(0)
class NexconnCustomMediaSlot1 : NexconnCustomMediaSlot(1)
class NexconnCustomMediaSlot2 : NexconnCustomMediaSlot(2)
class NexconnCustomMediaSlot3 : NexconnCustomMediaSlot(3)
class NexconnCustomMediaSlot4 : NexconnCustomMediaSlot(4)
class NexconnCustomMediaSlot5 : NexconnCustomMediaSlot(5)
class NexconnCustomMediaSlot6 : NexconnCustomMediaSlot(6)
class NexconnCustomMediaSlot7 : NexconnCustomMediaSlot(7)
class NexconnCustomMediaSlot8 : NexconnCustomMediaSlot(8)
class NexconnCustomMediaSlot9 : NexconnCustomMediaSlot(9)
class NexconnCustomMediaSlot10 : NexconnCustomMediaSlot(10)
class NexconnCustomMediaSlot11 : NexconnCustomMediaSlot(11)
class NexconnCustomMediaSlot12 : NexconnCustomMediaSlot(12)
class NexconnCustomMediaSlot13 : NexconnCustomMediaSlot(13)
class NexconnCustomMediaSlot14 : NexconnCustomMediaSlot(14)
class NexconnCustomMediaSlot15 : NexconnCustomMediaSlot(15)
