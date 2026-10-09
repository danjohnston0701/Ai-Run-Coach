# Add project specific ProGuard rules here.

# Gson reads and writes these by reflection — the JSON keys ARE the field names. Without these
# rules R8 renamed every field (sessionId -> a, ...) and even dropped deviceId/deviceModel, so
# every request the watch sent the server in a release build arrived unreadable (400 "Session
# ID required"), and queued runs written by one build couldn't be read back by the next.
-keep class live.airuncoach.airuncoach.wear.data.** { <fields>; <init>(...); }
-keep class live.airuncoach.airuncoach.wear.storage.** { <fields>; <init>(...); }
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod
