exports.expected = {
  "apply": [
    "plugin: \"com.android.application\"",
    "plugin: \"org.jetbrains.kotlin.android\"",
    "plugin: \"com.facebook.react\""
  ],
  "projectRoot": "rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()",
  "react": {
    "entryFile": "file([\"node\", \"-e\", \"require('expo/scripts/resolveAppEntry')\", projectRoot, \"android\", \"absolute\"].execute(null, rootDir).text.trim())",
    "reactNativeDir": "new File([\"node\", \"--print\", \"require.resolve('react-native/package.json')\"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()",
    "hermesCommand": "new File([\"node\", \"--print\", \"require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })\"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + \"/hermesc/%OS-BIN%/hermesc\"",
    "codegenDir": "new File([\"node\", \"--print\", \"require.resolve('@react-native/codegen/package.json', { paths: [require.resolve('react-native/package.json')] })\"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()",
    "enableBundleCompression": "(findProperty('android.enableBundleCompression') ?: false).toBoolean()",
    "cliFile": "new File([\"node\", \"--print\", \"require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })\"].execute(null, rootDir).text.trim())",
    "bundleCommand": "export:embed"
  },
  "enableMinifyInReleaseBuilds": "(findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()",
  "jscFlavor": "io.github.react-native-community:jsc-android:2026004.+",
  "android": {
    "ndkVersion": "rootProject.ext.ndkVersion",
    "buildToolsVersion": "rootProject.ext.buildToolsVersion",
    "compileSdk": "rootProject.ext.compileSdkVersion",
    "namespace": "com.helloworld",
    "defaultConfig": {
      "applicationId": "com.helloworld",
      "minSdkVersion": "rootProject.ext.minSdkVersion",
      "targetSdkVersion": "rootProject.ext.targetSdkVersion",
      "versionCode": "1",
      "versionName": "1.0",
      "buildConfigField": "\"String\", \"REACT_NATIVE_RELEASE_LEVEL\", \"\\\"${findProperty('reactNativeReleaseLevel') ?: 'stable'}\\\"\""
    },
    "signingConfigs": {
      "debug": {
        "storeFile": "file('debug.keystore')",
        "storePassword": "android",
        "keyAlias": "androiddebugkey",
        "keyPassword": "android"
      }
    },
    "buildTypes": {
      "debug": {
        "signingConfig": "signingConfigs.debug"
      },
      "release": {
        "signingConfig": "signingConfigs.debug",
        "enableShrinkResources": "findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'",
        "shrinkResources": "enableShrinkResources.toBoolean()",
        "minifyEnabled": "enableMinifyInReleaseBuilds",
        "proguardFiles": "getDefaultProguardFile(\"proguard-android-optimize.txt\"), \"proguard-rules.pro\"",
        "enablePngCrunchInRelease": "findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'",
        "crunchPngs": "enablePngCrunchInRelease.toBoolean()"
      }
    },
    "packagingOptions": {
      "jniLibs": {
        "enableLegacyPackaging": "findProperty('expo.useLegacyPackaging') ?: 'false'",
        "useLegacyPackaging": "enableLegacyPackaging.toBoolean()"
      }
    },
    "androidResources": {
      "ignoreAssetsPattern": "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
    }
  },
  "[\"pickFirsts\",": {
    "prop": "->",
    "options": [
      "(findProperty(\"android.packagingOptions.$prop\") ?: \"\").split(\",\")",
      "-= \"\""
    ],
    "for": "(i in 0..<options.size()) options[i] = options[i].trim()"
  },
  "dependencies": [
    {
      "group": "com.facebook.react",
      "name": "react-android",
      "version": "",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "com.facebook.fresco",
      "name": "animated-gif",
      "version": "${expoLibs.versions.fresco.get()}",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "com.facebook.fresco",
      "name": "webpsupport",
      "version": "${expoLibs.versions.fresco.get()}",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "com.facebook.fresco",
      "name": "animated-webp",
      "version": "${expoLibs.versions.fresco.get()}",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "com.facebook.react",
      "name": "hermes-android",
      "version": "",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "",
      "name": "jscFlavor",
      "version": "",
      "type": "implementation",
      "excludes": []
    }
  ]
};
