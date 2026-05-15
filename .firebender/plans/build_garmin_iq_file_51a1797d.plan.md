<!--firebender-plan
name: Build Garmin IQ File
overview: Build the new Garmin Watch IQ file with the updated running icon. The icon has already been created (white runner on teal background), and all source files are ready. This will compile the Monkey C code, bundle the new icon, and create the final IQ package for all 55 Garmin device models.
todos:
  - id: run_build_script
    content: "Execute the build-iq-automated.sh script to compile IQ file"
  - id: verify_output
    content: "Verify the IQ file was created successfully and is the correct type/size"
-->

## Build Process

The build will use the existing `build-iq-automated.sh` script that was just created, which:
- Verifies the Garmin SDK is installed
- Validates all project files exist
- Runs `monkeyc` compiler with the new icon
- Creates a 7-zip package for all 55 Garmin devices
- Outputs to `garmin-companion-app/bin/AiRunCoach.iq`

## Key Files Involved

- **Icon**: [`garmin-companion-app/resources/drawables/launcher_icon.png`](garmin-companion-app/resources/drawables/launcher_icon.png) - New running icon (512×512, teal background)
- **Build Script**: [`build-iq-automated.sh`](build-iq-automated.sh) - Automated build tool
- **Source**: [`garmin-companion-app/source/**/*.mc`](garmin-companion-app/source/) - Monkey C source code
- **Config**: [`garmin-companion-app/monkey.jungle`](garmin-companion-app/monkey.jungle) - Build configuration
- **Output**: `garmin-companion-app/bin/AiRunCoach.iq` - Final compiled IQ file (~1.1 MB, 7-zip format)

## Build Steps

1. Run the automated build script: `bash build-iq-automated.sh`
2. Script verifies monkeyc is available and working
3. Compiles Monkey C source with the new icon embedded
4. Creates 7-zip archive containing builds for all 55 Garmin device models
5. Outputs final `AiRunCoach.iq` file ready for Garmin Connect IQ store

## Expected Output

- Success message showing build completed
- New IQ file created at `garmin-companion-app/bin/AiRunCoach.iq`
- File size: ~1.1 MB
- File type: 7-zip archive
- File is signed with developer key and ready for upload
