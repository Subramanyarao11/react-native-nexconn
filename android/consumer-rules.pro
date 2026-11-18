# react-native-nexconn consumer R8/ProGuard rules.
#
# The Nexconn Android SDK (ai.nexconn.chat:chat) relies on reflection and JNI
# beyond what its own bundled proguard.txt keeps:
#  - message content classes are registered by their runtime
#    @ai.nexconn.imlib.model.MessageTag annotation and instantiated through
#    no-arg / Parcel constructors (stripping them gives
#    MessageNotRegistered 34021 and "[unknown]" history);
#  - native code reads fields of internal models such as
#    ai.nexconn.imlib.internal.model.EngineBuilderParam and SDKVersion by name
#    (stripping them aborts initialize/connect with a missing JNI field);
#  - this bridge serializes SDK models by reflecting over public getters.
# Keeping the whole SDK unobfuscated is the only configuration verified on a
# minified release build; narrow it only with a device test.

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

-keep class ai.nexconn.** { *; }
-keep interface ai.nexconn.** { *; }
-keep enum ai.nexconn.** { *; }
-keep class io.rong.** { *; }
-keep interface io.rong.** { *; }
-dontwarn ai.nexconn.**
-dontwarn io.rong.**

# Any class (SDK or app) annotated as a message content type.
-keep @ai.nexconn.imlib.model.MessageTag class * { *; }
-keep @io.rong.imlib.MessageTag class * { *; }
-keep class * extends ai.nexconn.imlib.message.MessageContent { *; }

# JNI entry points anywhere in the SDK.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# Custom message slot classes are instantiated by the SDK via reflection.
-keep class com.nexconn.bridge.NexconnCustomSlot* { public <init>(); *; }
-keep class com.nexconn.bridge.NexconnCustomMediaSlot* { public <init>(); *; }
