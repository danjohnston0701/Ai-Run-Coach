plugins {
    kotlin("multiplatform")
    kotlin("native.cocoapods")
    kotlin("plugin.serialization")
}

kotlin {
    iosX64()
    iosArm64()
    iosSimulatorArm64()

    cocoapods {
        version = "1.0.0"
        summary = "Shared AI Run Coach logic for iOS"
        homepage = "https://airuncoach.live"
        ios.deploymentTarget = "16.0"
        framework {
            baseName = "AiruncoachShared"
            isStatic = false
        }
        // License configuration for CocoaPods compliance
        license = "MIT"
        // Author information
        authors = "AI Run Coach Team"
    }

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(kotlin("stdlib-common"))
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
            }
        }
    }
}