# Compose Layout & Padding Guide

## 🔴 The Padding Deadzone Bug (SOLVED)

**Problem**: Screens with `Scaffold + bottomBar` had massive blank spaces when the keyboard appeared, making the save button unreachable.

**Root Cause**: The `imePadding()` modifier was being applied at the wrong level, creating conflicting padding calculations:

```kotlin
// ❌ WRONG - creates deadzone
Scaffold(
    modifier = Modifier.imePadding(),  // ← DON'T DO THIS
    bottomBar = { Button(...) }
) { padding ->
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding)  // padding already has bottom inset
    )
}
```

When IME appears, the Scaffold applies additional vertical shrinking PLUS the bottomBar adds its own spacing = **MASSIVE GAPS**.

---

## ✅ Correct Patterns

### Pattern 1: Scaffold with Fixed Bottom Button (MOST COMMON)

**When to use**: Form screens with a sticky "Save Changes" button at bottom.

```kotlin
Scaffold(
    // NO imePadding() here!
    topBar = { TopAppBar(...) },
    bottomBar = {
        Surface(modifier = Modifier.fillMaxWidth()) {
            Button(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                onClick = { /* save */ }
            ) { Text("Save Changes") }
        }
    },
    contentWindowInsets = WindowInsets(0)
) { padding ->
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)  // ← This handles bottom button spacing automatically
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.lg)  // ← Small safe buffer, NOT 120dp
    ) {
        // Form content
    }
}
```

**Key points**:
- ❌ NO `imePadding()` on Scaffold
- ✅ The `padding` parameter passed to content already accounts for bottomBar
- ✅ Add only a small `padding(bottom = Spacing.lg)` to LazyColumn for breathing room
- ✅ When keyboard appears, content automatically scrolls within the available space

---

### Pattern 2: Column with Scroll (No Fixed Button)

**When to use**: Login/signup screens, settings pages that scroll freely.

```kotlin
Box(
    modifier = Modifier
        .fillMaxSize()
        .background(Colors.backgroundRoot)
        .imePadding()  // ← OK here! Shrinks Box when keyboard appears
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.xl)
            .padding(bottom = Spacing.xl)
    ) {
        // Content that scrolls
    }
}
```

**Key points**:
- ✅ `imePadding()` on the Box level is correct (not on Scaffold, not on LazyColumn)
- ✅ Content automatically scrolls when keyboard appears
- ✅ No bottomBar competing for space

---

### Pattern 3: LazyColumn with Keyboard Input (Dialog Inside)

**When to use**: Injury logging screens with inline text fields + dialog.

```kotlin
Scaffold(
    topBar = { TopAppBar(...) },
    bottomBar = { Button(...) }
) { padding ->
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(horizontal = Spacing.lg)
            .imePadding()  // ← Safe here (on the scrollable content, not Scaffold)
    ) {
        // Content items
    }
}
```

**Key points**:
- ✅ `imePadding()` on LazyColumn after `.padding(padding)` is safe
- ✅ Allows scrollable content to adjust when keyboard appears
- ⚠️ Do NOT add excessive `contentPadding(bottom = ...)` — let `imePadding()` handle it

---

## 🔍 Debugging Checklist

When you see **massive blank spaces when the keyboard appears**:

1. **Check the Scaffold**:
   - ❌ Does it have `imePadding()`? → REMOVE IT
   - ✅ Does it have a `bottomBar`? → Let Scaffold handle the spacing

2. **Check the content (LazyColumn/Column)**:
   - ✅ Does it receive `padding` parameter from Scaffold? → USE IT
   - ✅ Add only `padding(bottom = Spacing.lg)` or `padding(bottom = Spacing.xl)` — NOT 100+dp
   - ⚠️ Never add `contentPadding(bottom = ...)` to LazyColumn if using `imePadding()` on it

3. **Check window insets**:
   - ✅ Use `contentWindowInsets = WindowInsets(0)` on Scaffold if parent is managing insets
   - ✅ Use `windowInsets = WindowInsets(0)` on TopAppBar for the same reason

---

## 🚀 Best Practices

### Bottom Padding Values

```kotlin
// ✅ Safe values for LazyColumn bottom padding
.padding(bottom = Spacing.lg)   // 16dp - minimal buffer
.padding(bottom = Spacing.xl)   // 24dp - standard safe spacing

// ❌ NEVER use these
.padding(bottom = 120.dp)  // Creates massive deadzone
.padding(bottom = 104.dp)  // Creates visible gap
```

### IME Padding Logic

```
When Scaffold has bottomBar:
  padding parameter = handles everything
  
When Column has verticalScroll:
  imePadding() = shrinks the Box/Column when keyboard appears
  
When LazyColumn has imePadding():
  Remove all excessive contentPadding(bottom = X)
  Let imePadding() do its job
```

---

## 📋 Template Screens

### Form Screen (PersonalDetailsScreen style)

```kotlin
@Composable
fun FormScreen(onSave: () -> Unit) {
    Scaffold(
        topBar = { TopAppBar(...) },
        bottomBar = {
            Surface(modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                ) { Text("Save") }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg)
                .padding(bottom = Spacing.lg)  // ← Key line
        ) {
            // Form items
        }
    }
}
```

### Login Screen (Column + Scroll style)

```kotlin
@Composable
fun LoginScreen() {
    Box(modifier = Modifier.fillMaxSize().imePadding()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg)
        ) {
            // Login form
        }
    }
}
```

---

## Related Files Fixed

- `PersonalDetailsScreen.kt` - Removed `imePadding()` from Scaffold
- `InjuryOnboardingScreen.kt` - Removed excessive `contentPadding(bottom = Spacing.xl)`
- `FitnessLevelScreen.kt` - Reduced bottom padding to `Spacing.xl`
- `MapMyRunSetupScreen.kt` - Reduced bottom padding to `Spacing.lg`

**Never repeat these patterns again!** ✅
