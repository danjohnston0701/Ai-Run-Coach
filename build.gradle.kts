// Top-level build file where you can add configuration options common to all sub-projects/modules.
allprojects {
    group = "live.airuncoach"
    version = "1.0.0"
}

plugins {
    id("com.android.application") version "9.0.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.10" apply false
    id("com.google.devtools.ksp") version "2.1.0-1.0.29" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" apply false
    id("com.google.dagger.hilt.android") version "2.59" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.10" apply false
    // NOTE: Uncomment after adding app/google-services.json from your Firebase project
    // id("com.google.gms.google-services") version "4.4.2" apply false
}