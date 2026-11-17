# react-native-nexconn serializes Nexconn SDK models generically by reflecting
# over their public getters, so their names must survive shrinking.
-keep class ai.nexconn.chat.** { public *; }
-keepnames class ai.nexconn.chat.** { *; }

# Custom message slot classes are instantiated by the SDK via reflection.
-keep class com.nexconn.bridge.NexconnCustomSlot* { public <init>(); *; }
-keep class com.nexconn.bridge.NexconnCustomMediaSlot* { public <init>(); *; }
