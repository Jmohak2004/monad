import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
}

// The web app this Trusted Web Activity opens (see ../gradle.properties).
val gharUrl: URI = URI(providers.gradleProperty("ghar.url").get().trimEnd('/') + "/")
val gharOrigin = "${gharUrl.scheme}://${gharUrl.authority}"

// Optional release signing from android/keystore.properties (gitignored).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.jmohak2004.ghar"
    compileSdk = 36

    defaultConfig {
        applicationId = providers.gradleProperty("ghar.applicationId").get()
        // Android 9+: passkeys with WebAuthn PRF via Google Password Manager.
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        manifestPlaceholders += mapOf(
            "hostName" to gharUrl.host,
            "urlScheme" to gharUrl.scheme,
            "launchUrl" to gharUrl.toString(),
        )
        // Digital Asset Links statement: this app claims the web origin. The site
        // must publish the matching /.well-known/assetlinks.json (served by web/).
        resValue(
            "string",
            "asset_statements",
            """[{\"relation\": [\"delegate_permission/common.handle_all_urls\"], \"target\": {\"namespace\": \"web\", \"site\": \"$gharOrigin\"}}]""",
        )
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        resValues = true
        buildConfig = false
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}

// Verified TWAs (no URL bar, App Links) need HTTPS, so refuse to ship a release pointed at localhost.
val releaseUrlScheme = gharUrl.scheme
tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }.configureEach {
    doFirst {
        check(releaseUrlScheme == "https") {
            "ghar.url must be an https:// origin for release builds (got $releaseUrlScheme). Pass -Pghar.url=https://your-domain"
        }
    }
}
