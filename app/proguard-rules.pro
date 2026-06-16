# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ============================================================================
# CRITICAL: Keep all model classes used with Gson/JSON deserialization
# ============================================================================
# When minification is enabled (release builds), ProGuard obfuscates field names.
# Gson uses reflection to match JSON field names to class fields.
# If field names are obfuscated, Gson crashes with "no field found" errors.
# 
# Solution: Keep all @SerializedName annotations and model classes intact.

# Keep Gson annotations AND signatures (needed for reflection)
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Keep all @SerializedName annotated fields
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName *;
}

# ============================================================================
# CRITICAL: Keep all data/model classes (domain and network models)
# ============================================================================
# Keep entire AI Run Coach model hierarchy — these are used by Gson reflection
-keep class live.airuncoach.airuncoach.domain.model.** { *; }
-keep class live.airuncoach.airuncoach.network.model.** { *; }

# Keep Kotlin-specific synthetic methods (data class copy, constructors, etc.)
-keepclassmembers class live.airuncoach.airuncoach.domain.model.** {
    <init>(...);
    public <methods>;
}

-keepclassmembers class live.airuncoach.airuncoach.network.model.** {
    <init>(...);
    public <methods>;
}

# Keep enum values (enums are deserialized by name)
-keepclassmembers enum live.airuncoach.airuncoach.domain.model.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ============================================================================
# CRITICAL: Keep custom Gson TypeAdapters and factories
# ============================================================================
# The IsoDateLongAdapterFactory custom type adapter MUST NOT be obfuscated
-keep class live.airuncoach.airuncoach.network.IsoDateLongAdapterFactory { *; }
-keep class live.airuncoach.airuncoach.network.RetrofitClient { *; }

# Keep Gson internal infrastructure
-keep class com.google.gson.** { *; }
-keep interface com.google.gson.** { *; }
-keep class com.google.gson.reflect.** { *; }

# Keep TypeToken (used by custom adapters)
-keepclassmembers class com.google.gson.reflect.TypeToken {
    public <init>(...);
}

# ============================================================================
# Keep Retrofit API interfaces and annotations
# ============================================================================
-keep interface live.airuncoach.airuncoach.network.** { *; }
-keep class live.airuncoach.airuncoach.network.** { *; }
-keep @interface retrofit2.** { *; }
-keep class retrofit2.** { *; }

# ============================================================================
# Keep Hilt/Dagger dependency injection components
# ============================================================================
# Hilt uses reflection to find @HiltViewModel, @Inject, etc.
-keep class dagger.hilt.** { *; }
-keep interface dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep @dagger.hilt.** class * { *; }
-keep @javax.inject.** class * { *; }
-keep @dagger.hilt.android.qualifiers.** class * { *; }

# Keep ViewModels (used by hiltViewModel())
-keep class live.airuncoach.airuncoach.viewmodel.** { *; }

# ============================================================================
# Keep Firebase/Google Play Services
# ============================================================================
# Firebase uses reflection for messaging, analytics, etc.
-keep class com.google.firebase.** { *; }
-keep interface com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# ============================================================================
# Keep Picovoice wake word detection
# ============================================================================
# Picovoice SDK uses reflection and JNI
-keep class ai.picovoice.** { *; }
-keep class com.picovoice.** { *; }
-keepclasseswithmembernames class ai.picovoice.** {
    native <methods>;
}

# ============================================================================
# Keep Garmin ConnectIQ SDK (CRITICAL - Parcelable marshalling)
# ============================================================================
# Garmin SDK uses reflection for plugin discovery and communication
# ESPECIALLY IMPORTANT: Garmin sends Parcelable objects (IQDevice, IQApp) via broadcasts
# If these classes are obfuscated, Parcel unmarshalling fails with ClassNotFoundException
-keep class com.garmin.android.connectiq.** { *; }
-keep interface com.garmin.android.connectiq.** { *; }

# Preserve Parcelable classes from Garmin (required for intent/broadcast deserialization)
-keep class com.garmin.android.connectiq.IQDevice { *; }
-keep class com.garmin.android.connectiq.IQApp { *; }
-keep class com.garmin.android.connectiq.IQDevice$IQDeviceStatus { *; }

# Keep all Garmin Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Garmin enum values (enums referenced in broadcasts)
-keepclassmembers enum com.garmin.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ============================================================================
# Keep Google Play Core (In-App Updates)
# ============================================================================
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

# ============================================================================
# Keep OkHttp (used by Retrofit)
# ============================================================================
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okio.** { *; }

# ============================================================================
# Keep Room database entities and DAOs
# ============================================================================
# Room uses reflection to access @Entity and @Dao classes
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }
-keep class live.airuncoach.airuncoach.data.database.** { *; }
-keepclassmembers class live.airuncoach.airuncoach.data.database.** {
    <init>(...);
    public <methods>;
}

# ============================================================================
# Keep Kotlin serialization metadata
# ============================================================================
# Kotlin reflection and serialization use internal metadata
-keepattributes *Annotation*
-keep class kotlin.** { *; }
-keep class kotlinx.serialization.** { *; }
-keep @kotlinx.serialization.Serializable class * { *; }

# ============================================================================
# Keep SessionManager (used for token/auth storage)
# ============================================================================
-keep class live.airuncoach.airuncoach.data.SessionManager { *; }

# ============================================================================
# Keep CoachingFeaturePreferences (used after login)
# ============================================================================
-keep class live.airuncoach.airuncoach.data.CoachingFeaturePreferences { *; }

# ============================================================================
# Keep all ViewModels and their state classes
# ============================================================================
-keep class live.airuncoach.airuncoach.viewmodel.LoginState { *; }
-keepclassmembers class live.airuncoach.airuncoach.viewmodel.LoginState {
    <init>(...);
    public <methods>;
}

# ============================================================================
# Keep all data classes used by ViewModels
# ============================================================================
-keepclassmembers class live.airuncoach.airuncoach.viewmodel.** {
    <init>(...);
    public <methods>;
}

# ============================================================================
# Keep Kotlin standard library (data classes, collections, etc.)
# ============================================================================
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
-keepclassmembers class kotlin.** {
    <init>(...);
}

# ============================================================================
# Keep all domain models (especially those with generics like List<T>)
# ============================================================================
# The Injury model is used in List<Injury> in User, which can cause
# "java.lang.Class cannot be cast to java.lang.reflect.ParameterizedType" errors
-keep class live.airuncoach.airuncoach.domain.model.Injury { *; }
-keep enum live.airuncoach.airuncoach.domain.model.InjuryStatus { *; }
-keepclassmembers class live.airuncoach.airuncoach.domain.model.Injury {
    <init>(...);
    public <methods>;
}
-keepclassmembers enum live.airuncoach.airuncoach.domain.model.InjuryStatus {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ============================================================================
# Keep AndroidX/Jetpack Compose (already handled by androidx-all.pro)
# ============================================================================
# Already included via getDefaultProguardFile("proguard-android-optimize.txt")

# ============================================================================
# Uncomment this to preserve the line number information for debugging
# ============================================================================
#-keepattributes SourceFile,LineNumberTable
#-renamesourcefileattribute SourceFile