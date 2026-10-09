import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Deliberately no Hilt here — this module uses manual DI via WearApplication (see
// WearApplication.kt) to keep the watch build lightweight, mirroring the Garmin
// Connect IQ companion app's lack of any DI framework at all.

// ── Load local.properties for signing credentials (same keystore/keys as app/) ─────
val localProps = Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) localProps.load(localPropsFile.inputStream())

fun localProp(key: String): String =
    localProps.getProperty(key) ?: System.getenv(key) ?: ""

android {
    namespace = "live.airuncoach.airuncoach.wear"
    compileSdk = 36

    defaultConfig {
        // Same applicationId as the phone app (app/), published as the Wear OS form factor
        // of the phone app's Play listing. Required: the Wear Data Layer (MessageClient/
        // CapabilityClient) only connects apps with the same package name AND signing key.
        // Still standalone (manifest's com.google.android.wearable.standalone = true).
        applicationId = "live.airuncoach.airuncoach"
        // Wear OS 3.0+ (API 30) is required for the Health Services ExerciseClient API
        // this app depends on — effectively Galaxy Watch4 and later.
        minSdk = 30
        targetSdk = 36
        // Version codes are shared with the phone app's listing (phone is ~100 and counts
        // up by 1), so the watch lives in its own 1,000,000+ range to never collide.
        // Increment by 1 for every Play upload.
        versionCode = 1_000_009
        versionName = "1.0.8"
    }

    // ── Release signing ─────────────────────────────────────────────────────
    // Reuses the same keystore/credentials as app/build.gradle.kts (local.properties
    // keys: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD) — a Wear OS
    // standalone app doesn't need to share signing with its paired phone app, but
    // keeping one keystore is simpler to manage.
    signingConfigs {
        create("release") {
            storeFile     = file(localProp("KEYSTORE_PATH"))
            storePassword = localProp("KEYSTORE_PASSWORD")
            keyAlias      = localProp("KEY_ALIAS")
            keyPassword   = localProp("KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "BASE_URL", "\"https://airuncoach.live\"")
        }
        debug {
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions {
        // android.util.Log etc. are stubs on the JVM; return defaults instead of throwing.
        unitTests.isReturnDefaultValues = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // --- Core ---
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    // Transitively pulled in at 1.2.4 by another dependency, below the 1.3.0 floor
    // registerForActivityResult() requires — pin explicitly to satisfy lint-vital.
    implementation("androidx.fragment:fragment-ktx:1.6.2")

    // --- Jetpack Compose for Wear OS (NOT standard Compose Material3 — Wear uses its own) ---
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.wear.compose:compose-navigation:1.4.0")
    implementation("androidx.wear:wear:1.3.0")
    // Ongoing Activity: a run in progress shows on the watch face / recents (RunTrackingService).
    implementation("androidx.wear:wear-ongoing:1.0.0")

    // --- Wear OS Data Layer: phone<->watch messaging (MessageClient/CapabilityClient) ---
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")

    // --- Health Services: native exercise-session recording (ExerciseClient) — the
    // Wear OS analog to Garmin's ActivityRecording.Session ---
    implementation("androidx.health:health-services-client:1.1.0-rc02")
    // ExerciseClient's async methods return Guava's ListenableFuture.
    implementation("com.google.guava:guava:33.0.0-android")

    // --- Local storage: auth token, crash breadcrumb, offline GPS buffer ---
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // --- Background sync of runs saved while offline (SyncWorker) ---
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    // Queued runs / checkpoints are JSON files (PendingRunStore).
    implementation("com.google.code.gson:gson:2.10.1")

    // --- Direct-HTTP standalone/offline path to the backend (mirrors the phone app's
    // Retrofit setup — same versions as app/build.gradle.kts) ---
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // --- Location (GPS quality monitoring / fallback) ---
    implementation("com.google.android.gms:play-services-location:21.1.0")

    // --- Testing ---
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
