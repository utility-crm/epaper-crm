plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.google.services) apply false
}

// The Google Services plugin fails the build outright when google-services.json is missing.
// Applying it conditionally keeps the project buildable before Firebase is provisioned; drop
// the file into app/ and Google + Phone auth light up with no build-script change.
if (file("google-services.json").exists()) {
  apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.epaperspace.publisher"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.epaperspace.publisher"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"https://api.epaperspace.com/\"")
            buildConfigField("boolean", "LOG_HTTP_BODIES", "true")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://api.epaperspace.com/\"")
            // Request/response bodies carry the Bearer token and password payloads. Never log them
            // in a shipped build.
            buildConfigField("boolean", "LOG_HTTP_BODIES", "false")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      aidl = false
      buildConfig = true
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // Networking
  implementation(libs.retrofit)
  implementation(libs.retrofit.converter.gson)
  implementation(libs.okhttp)
  implementation(libs.okhttp.logging)

  // DI
  implementation(libs.koin.android)
  implementation(libs.koin.androidx.compose)

  // Security
  implementation(libs.androidx.security.crypto)

  // Material icons (nav rail, action buttons)
  implementation(libs.androidx.compose.material.icons.extended)

  // Firebase auth: Google sign-in + Phone OTP. Both exchange a Firebase idToken at the
  // worker for a platform JWT; Firebase is never the app's own session.
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.auth)
  implementation(libs.androidx.credentials)
  implementation(libs.androidx.credentials.play.services)
  implementation(libs.googleid)
  implementation(libs.kotlinx.coroutines.play.services)

  // Page thumbnails need the Authorization header, so Coil rides the authed OkHttp client.
  implementation(libs.coil.compose)
  implementation(libs.coil.network.okhttp)

  // Platform billing checkout (subscription / e-mandate flow)
  implementation(libs.razorpay.checkout)
  // checkout asks for standard-core "LATEST". Declaring it here overrides that floating version so
  // a Razorpay release cannot silently change what we ship.
  implementation(libs.razorpay.standard.core)
}
