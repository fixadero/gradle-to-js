exports.expected = {
  "buildscript": {
    "repositories": [
      {
        "type": "unknown",
        "data": {
          "name": "google()"
        }
      },
      {
        "type": "unknown",
        "data": {
          "name": "mavenCentral()"
        }
      }
    ],
    "dependencies": [
      {
        "group": "",
        "name": "'com.android.tools.build:gradle')     classpath('com.facebook.react:react-native-gradle-plugin'",
        "version": "",
        "type": "classpath",
        "excludes": []
      },
      {
        "group": "",
        "name": "kotlinVersion = findProperty('android.kotlinVersion')",
        "version": "",
        "type": "def",
        "excludes": []
      },
      {
        "group": "",
        "name": "kotlinVersion ? \"org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion\" : 'org.jetbrains.kotlin:kotlin-gradle-plugin'",
        "version": "",
        "type": "classpath",
        "excludes": []
      }
    ]
  },
  "allprojects": {
    "repositories": [
      {
        "type": "unknown",
        "data": {
          "name": "google()"
        }
      },
      {
        "type": "unknown",
        "data": {
          "name": "mavenCentral()"
        }
      },
      {
        "type": "maven",
        "data": {}
      }
    ]
  },
  "apply": [
    "plugin: \"expo-root-project\"",
    "plugin: \"com.facebook.react.rootproject\""
  ]
};
