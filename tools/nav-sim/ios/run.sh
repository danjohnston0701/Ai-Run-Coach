#!/bin/bash
# Compile the iOS app's RouteNavigator.swift with the harness and replay all nav-sim fixtures.
# Run from the monorepo root. IOS_SRC overrides the iOS project's source folder.
set -euo pipefail
IOS_SRC="${IOS_SRC:-$HOME/Desktop/Ai-Run-Coach-iOS/Ai Run Coach/Ai Run Coach}"
BIN="app/build/nav-sim/ios-navsim"
mkdir -p app/build/nav-sim
xcrun swiftc -O -o "$BIN" "$IOS_SRC/RouteNavigator.swift" tools/nav-sim/ios/main.swift
"$BIN"
