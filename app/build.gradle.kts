import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
}

// ── Load local.properties for signing credentials ──────────────────────────
val localProps = Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) localProps.load(localPropsFile.inputStream())

fun localProp(key: String): String =
    localProps.getProperty(key) ?: System.getenv(key) ?: ""

android {
    namespace = "live.airuncoach.airuncoach"
    compileSdk = 36          // Must be 36 for Health Connect library

    defaultConfig {
        applicationId = "live.airuncoach.airuncoach"
        minSdk = 26
        targetSdk = 35          // Google Play requires 35+ minimum as of June 2026
        versionCode = 12          // ← Increment by 1 for every Play Store upload
        versionName = "1.5.0"   // ← Human-readable version shown in Play Store

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    // ── Release signing ────────────────────────────────────────────────────────
    // Store keystore credentials in local.properties (never commit that file!)
    // Keys: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
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
            isMinifyEnabled = true    // Shrink & obfuscate code
            isShrinkResources = true  // Remove unused resources
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Define the base URL for the release (production) build.
            buildConfigField("String", "BASE_URL", "\"https://airuncoach.live\"")
            // OpenWeatherMap API key
            buildConfigField("String", "WEATHER_API_KEY", "\"5cce843c24f81f4ea2c2880b112e27d5\"")
            // Google Cloud Platform API key (for Maps later)
            buildConfigField("String", "GOOGLE_API_KEY", "\"AIzaSyAunS1M9c5wxGMqjd9gOoNTvso7AACZcF0\"")
            // Picovoice Porcupine AccessKey — set PICOVOICE_ACCESS_KEY in local.properties
            buildConfigField("String", "PICOVOICE_ACCESS_KEY", "\"${localProp("PICOVOICE_ACCESS_KEY")}\"")
        }
        debug {
            // Define the base URL for the debug (local development) build.
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
            // OpenWeatherMap API key
            buildConfigField("String", "WEATHER_API_KEY", "\"5cce843c24f81f4ea2c2880b112e27d5\"")
            // Google Cloud Platform API key (for Maps later)
            buildConfigField("String", "GOOGLE_API_KEY", "\"AIzaSyAunS1M9c5wxGMqjd9gOoNTvso7AACZcF0\"")
            // Picovoice Porcupine AccessKey — set PICOVOICE_ACCESS_KEY in local.properties
            buildConfigField("String", "PICOVOICE_ACCESS_KEY", "\"${localProp("PICOVOICE_ACCESS_KEY")}\"")
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
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {

    // --- Dagger Hilt ---
    implementation("com.google.dagger:hilt-android:2.59")
    ksp("com.google.dagger:hilt-compiler:2.59")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // --- Core Architecture Libraries ---
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")

    // --- Navigation ---
    implementation("androidx.navigation:navigation-compose:2.7.7")
    
    // --- DataStore: User Preferences ---
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // --- Jetpack Compose UI Toolkit ---
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.ui:ui-text")


    // --- Networking: Retrofit for API calls ---
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // --- Location Services: Google Play Services for GPS tracking ---
    implementation("com.google.android.gms:play-services-location:21.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
    
    // --- Google Maps: For route display and navigation ---
    implementation("com.google.android.gms:play-services-maps:18.2.0")
    implementation("com.google.maps.android:maps-compose:4.3.0")
    implementation("com.google.maps.android:android-maps-utils:3.8.2")

    // --- Image Loading: Coil for profile pictures ---
    implementation("io.coil-kt:coil-compose:2.5.0")

    // --- Charts ---

    // --- Local Database: Room for offline queue ---
    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    ksp("androidx.room:room-compiler:2.7.1")

    // --- Background Syncing: WorkManager ---
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // --- Secure Storage: For saving the auth token ---
    implementation("androidx.security:security-crypto:1.1.0")

    // --- Health Connect: For wellness data ---
    implementation("androidx.health.connect:connect-client:1.1.0")

    // --- Garmin OAuth Dependencies ---
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")

    // OAuth 1.0a signing (for Garmin Connect API)
    implementation("se.akerfeldt:okhttp-signpost:1.1.0")
    implementation("oauth.signpost:signpost-core:2.1.1")

    // --- Garmin ConnectIQ SDK (Scenario 2 — Phone + Watch BT bridge) ---
    // Available on Maven Central — no AAR download needed.
    // Requires Garmin Connect app installed on the user's phone to communicate with the watch.
    implementation("com.garmin.connectiq:ciq-companion-app-sdk:2.3.0@aar")

    // --- Picovoice Porcupine: On-device wake word detection ("hey coach") ---
    // Always-on, ~1% CPU, fully offline, sub-100ms response.
    // Requires: PICOVOICE_ACCESS_KEY in local.properties + hey_coach_android.ppn in assets/
    implementation("ai.picovoice:porcupine-android:3.0.2")

    // --- Firebase: Cloud Messaging for push notifications ---
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")

    // --- Google Play Billing: In-app subscriptions and purchases ---
    implementation("com.android.billingclient:billing-ktx:7.0.0")

    // --- Testing Libraries ---
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.06.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
