# Feature Enhancement Plan: Comprehensive Nutrient Tracking & Progress System

## Overview
Enhance the nutritional tracking system to provide complete nutrient visibility, customizable targets/limits, and visual feedback for user goals.

---

## 1. Nutrient Display Consistency

### 1.1 Audit Current Display Coverage
- **Locations to check:**
  - Daily entry screen (entry page)
  - History view
  - Food database manager
  - Calculated nutrients preview
  - Daily totals/progress bars

- **Nutrients to ensure are displayed:**
  - Energy (kcal)
  - Protein (g)
  - Carbohydrates (g)
  - Fat (g)
  - Sugar (g)
  - Saturated Fat (g)
  - Fibre (g)
  - Salt (g)
  - Calcium (mg)

### 1.2 Implementation Tasks
- [ ] Add Calcium display to daily entry screen totals
- [ ] Ensure Calcium badge appears in entry lists (if not already present)
- [ ] Verify all nutrients show in food database item cards
- [ ] Update calculated nutrients preview to show all attributes
- [ ] Ensure history view displays all nutrients consistently

---

## 2. Editable Progress Bar Targets/Limits

### 2.1 Data Model Updates
- [ ] Create `DailyTargets` model with fields:
  - `date: date`
  - `mode: str` (enum: "target" or "limit")
  - `energy_kcal: float`
  - `protein_g: float`
  - `carbohydrates_g: float`
  - `fat_g: float`
  - `sugar_g: float`
  - `saturated_fat_g: float`
  - `fibre_g: float`
  - `salt_g: float`
  - `calcium_mg: float`

### 2.2 Storage Implementation
- [ ] Add methods to FileStorage:
  - `save_daily_targets(date, targets)`
  - `load_daily_targets(date)`
  - `get_previous_day_targets(date)` - for copying to new days
- [ ] Store targets in `nutritional_data/daily_targets.json` or similar

### 2.3 UI Components
- [ ] Add "Edit Targets" button/modal on daily entry screen
- [ ] Create target editor form with:
  - Input fields for all 9 nutrients
  - Toggle switch for "Target" vs "Limit" mode
  - Save/Cancel buttons
  - "Copy from previous day" option
- [ ] Display current mode indicator near progress bars

---

## 3. Expand Progress Bars to All Nutrients

### 3.1 Update Progress Bar Section
- [ ] Modify `create_thin_progress_bar()` helper to support all nutrient types
- [ ] Add unit detection (g, mg, kcal) for proper formatting
- [ ] Create progress bars for:
  - Sugar
  - Saturated Fat
  - Fibre
  - Salt
  - Calcium

### 3.2 Layout Adjustments
- [ ] Design compact layout for 9 progress bars (possibly 2 columns on desktop)
- [ ] Ensure responsive design for mobile
- [ ] Group related nutrients visually (macros, micros, etc.)

---

## 4. Target/Limit Loading Logic

### 4.1 Daily Initialization
- [ ] Create callback that runs on page load for entry screen:
  - Check if targets exist for current date
  - If not, load previous day's targets
  - If no previous day, use sensible defaults
  - Display loaded targets in progress bars

### 4.2 Integration Points
- [ ] Update entry page load callback
- [ ] Ensure targets are loaded when date changes
- [ ] Save targets when user updates them

---

## 5. Visual Feedback System

### 5.1 Icon Implementation
- [ ] Add Material Design icons (or similar) to project:
  - Green checkmark/tick (✓)
  - Yellow warning (⚠️)
  - Red alert (⚠️ but red)

### 5.2 Progress Bar Enhancement
- [ ] Modify `create_thin_progress_bar()` to include:
  - `mode` parameter ("target" or "limit")
  - `current_value` and `target_value` parameters
  - Logic for calculating threshold breaches

### 5.3 Visual Logic
- [ ] **Limit Mode:**
  - If value > target * 1.0 and <= target * 1.1: Show yellow ⚠️
  - If value > target * 1.1: Show red ⚠️
  - Otherwise: No indicator

- [ ] **Target Mode:**
  - If value >= target: Show green ✓
  - Otherwise: No indicator

### 5.4 CSS Styling
- [ ] Add classes for indicator badges:
  - `.target-met` (green)
  - `.limit-warning` (yellow)
  - `.limit-exceeded` (red)
- [ ] Style icons to be small and positioned at end of progress bar

---

## 6. Default Values & Configuration

### 6.1 Sensible Defaults
Define default targets based on common nutritional guidelines:
- Energy: 2000 kcal
- Protein: 50 g (target) or 150 g (limit)
- Carbohydrates: 260 g
- Fat: 70 g
- Sugar: 90 g (limit)
- Saturated Fat: 20 g (limit)
- Fibre: 30 g (target)
- Salt: 6 g (limit)
- Calcium: 700 mg (target)

### 6.2 Default Mode
- [ ] Set appropriate default modes per nutrient:
  - Targets: Energy, Protein, Fibre, Calcium
  - Limits: Sugar, Saturated Fat, Salt

---

## 7. Testing Plan

### 7.1 Unit Tests
- [ ] Test target/limit loading logic
- [ ] Test previous day fallback
- [ ] Test threshold calculation (10% breach detection)
- [ ] Test icon display conditions

### 7.2 Integration Tests
- [ ] Test target persistence across sessions
- [ ] Test mode toggle functionality
- [ ] Test visual indicators appear correctly

### 7.3 UI/UX Testing
- [ ] Verify all nutrients display on all screens
- [ ] Verify progress bars are readable with 9 items
- [ ] Test edit targets modal workflow
- [ ] Test responsive layout on mobile

---

## 8. Implementation Order (Suggested)

1. **Phase 1: Data & Storage** (Foundation)
   - Data model for targets
   - Storage methods
   - Default values

2. **Phase 2: Display Consistency** (Quick win)
   - Add missing nutrients to all screens
   - Ensure Calcium appears everywhere

3. **Phase 3: Expanded Progress Bars** (Core feature)
   - Add progress bars for all 9 nutrients
   - Update layout

4. **Phase 4: Editable Targets** (User control)
   - Target editor UI
   - Save/load logic
   - Previous day copying

5. **Phase 5: Visual Feedback** (Polish)
   - Mode toggle
   - Icon indicators
   - Threshold logic

6. **Phase 6: Testing & Refinement**
   - Comprehensive testing
   - Bug fixes
   - UX improvements

---

## 9. Technical Considerations

- **Performance:** Loading 9 progress bars shouldn't impact page load significantly
- **Data migration:** Existing users won't have target data - handle gracefully
- **Mobile UX:** 9 progress bars need careful layout on small screens
- **Accessibility:** Ensure color-blind users can distinguish indicators (use icons + color)
- **Validation:** Ensure target values are reasonable (positive numbers, within sensible ranges)

---

## 10. Future Enhancements (Out of Scope)

- Weekly/monthly target views
- Target recommendations based on user profile (age, weight, activity)
- Progress trends over time
- Notifications when consistently exceeding limits
