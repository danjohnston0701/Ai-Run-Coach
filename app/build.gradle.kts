plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "live.airuncoach.airuncoach"
    compileSdk = 34

    defaultConfig {
        applicationId = "live.airuncoach.airuncoach"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
        }
        debug {
            // Define the base URL for the debug (local development) build.
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
            // OpenWeatherMap API key
            buildConfigField("String", "WEATHER_API_KEY", "\"5cce843c24f81f4ea2c2880b112e27d5\"")
            // Google Cloud Platform API key (for Maps later)
            buildConfigField("String", "GOOGLE_API_KEY", "\"AIzaSyAunS1M9c5wxGMqjd9gOoNTvso7AACZcF0\"")
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

dependencies {

    // --- Core Architecture Libraries ---
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")

    // --- Navigation ---
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // --- Jetpack Compose UI Toolkit ---
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

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

    // --- Image Loading: Coil for profile pictures ---
    implementation("io.coil-kt:coil-compose:2.5.0")

    // --- Local Database: Room for offline queue ---
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // --- Background Syncing: WorkManager ---
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // --- Secure Storage: For saving the auth token ---
    implementation("androidx.security:security-crypto:1.1.0")

    // --- Garmin SDK (We will keep this commented out for now to ensure stability) ---
    // implementation("com.garmin.android:connectiq:5.1.0")

    // --- Testing Libraries ---
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.06.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
