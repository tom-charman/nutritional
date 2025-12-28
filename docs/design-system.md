# Nutritional Tracker - Design System

## Overview
This document describes the modern visual design system implemented for the Nutritional Tracker application.

## Color Palette

### Brand Colors
- **Primary (Deep Teal)**: `#0F766E` - Used for navbar, primary buttons, and active states
- **Primary Hover**: `#0D5E57` - Darker shade for hover states
- **Accent (Amber)**: `#F59E0B` - Used for action buttons and highlights
- **Accent Secondary (Emerald)**: `#10B981` - Success states and positive indicators

### Background & Surfaces
- **Body Background**: `#F4F6F8` - Off-white/Light gray for reduced eye strain
- **Card Surface**: `#FFFFFF` - Pure white for cards and panels
- **Border Light**: `#E2E8F0` - Subtle borders

### Text Colors
- **Text Primary**: `#1E293B` - Dark slate for main headings and important text
- **Text Secondary**: `#64748B` - Cool gray for secondary text
- **Text Muted**: `#94A3B8` - Light gray for less important text

### Semantic Colors
- **Success**: `#10B981` - Green for success messages
- **Danger**: `#EF4444` - Red for errors and destructive actions
- **Warning**: `#F59E0B` - Amber for warnings
- **Info**: `#3B82F6` - Blue for informational messages

### Macro Nutrient Colors
- **Protein**: `#3B82F6` (Blue) - Badge background: `#DBEAFE`
- **Carbohydrates**: `#F59E0B` (Amber) - Badge background: `#FEF3C7`
- **Fat**: `#EC4899` (Pink) - Badge background: `#FCE7F3`
- **Calories**: `#F59E0B` (Amber) - Badge background: `#FFEDD5`

## Typography

### Font Family
- **Primary**: Inter (imported from Google Fonts)
- **Fallback**: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

### Font Sizes
- **Extra Small**: 12px
- **Small**: 14px
- **Base**: 16px
- **Large**: 18px
- **Extra Large**: 24px
- **2X Large**: 32px

### Font Weights
- **Normal**: 400
- **Medium**: 500
- **Semi-Bold**: 600
- **Bold**: 700

### Typography Hierarchy
- **Page Titles**: 24px, Weight 700 (Bold)
- **Card Headers**: 16px, Weight 500 (Medium), Uppercase with letter-spacing
- **Body Text**: 16px, Weight 400 (Regular)
- **Small Text**: 14px

## Layout & Spacing

### Border Radius
- **Cards**: 16px
- **Buttons**: 8px
- **Inputs**: 8px

### Shadows
- **Card Shadow**: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)`
- **Hover Shadow**: `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)`
- **Navbar Shadow**: `0 2px 4px rgba(0, 0, 0, 0.1)`
- **Primary Button Shadow**: `0 4px 6px rgba(15, 118, 110, 0.2)`

### Standard Gap
- **Default spacing between elements**: 24px (1.5rem)

### Container
- **Max Width**: 1400px - Prevents uncomfortable stretching on ultra-wide monitors
- **Padding**: 24px on left and right

## Component Styles

### Navigation Bar
- **Background**: Deep Teal (`#0F766E`)
- **Height**: 70px
- **Shadow**: Subtle shadow for depth
- **Brand Text**: Bold white, 20px
- **Nav Links**: Pill-style with hover effects, rgba background on hover

### Cards
- **Background**: Pure white
- **Border Radius**: 16px
- **Shadow**: Soft shadow with hover elevation
- **Padding**: 24px
- **Margin Bottom**: 24px
- **Border**: None (removed Bootstrap default borders)

### Summary Statistic Cards
- **Special Features**:
  - Top colored bar (gradient from primary to accent)
  - Emoji icon in colored circle
  - Large number (32px, bold)
  - Small uppercase label
  - Hover effect: slight elevation

### Buttons

#### Primary Button
- **Background**: Deep Teal
- **Color**: White
- **Shadow**: Teal-tinted shadow
- **Hover**: Darker teal with elevated shadow
- **Active**: Scale down slightly (0.98)
- **Padding**: 10px 24px
- **Border Radius**: 8px

#### Secondary/Outline Button
- **Background**: Transparent
- **Border**: 2px solid Primary
- **Color**: Primary
- **Hover**: Filled with primary color

### Form Controls

#### Input Fields
- **Style**: Filled (not outlined)
- **Background**: `#F1F5F9` (light gray)
- **Border**: 2px transparent
- **Focus**: White background, teal border, subtle teal glow
- **Padding**: 12px 16px
- **Border Radius**: 8px

### Progress Bars
- **Height**: 24px
- **Border Radius**: 12px
- **Background**: `#E2E8F0`
- **Fill**: Gradient (primary to accent)
- **Nutrient-specific colors**:
  - Protein: Blue gradient
  - Carbs: Amber gradient
  - Fat: Pink gradient
  - Calories: Teal to emerald gradient

### Macro Badges
- **Display**: Inline pill-shaped badges
- **Font Size**: 12px
- **Font Weight**: Medium (500)
- **Padding**: 4px 12px
- **Border Radius**: 12px
- **Margin**: 0 4px

### Food Item Rows
- **Display**: Horizontal card strips
- **Background**: White
- **Border Radius**: 8px
- **Border Left**: 3px solid teal (accent bar)
- **Shadow**: Subtle on hover
- **Layout**: Flexbox with space-between
- **Gap**: 12px between elements

### Tabs
- **Border Bottom**: 2px solid light gray
- **Active Indicator**: 3px bottom border in primary color
- **Hover**: Light teal background
- **Padding**: 12px 24px

### Plotly Charts
- **Container**: White card with shadow
- **Background**: Transparent (blends with card)
- **Grid Lines**: Very light (`rgba(0,0,0,0.05)`)
- **Font**: Inter to match app
- **Colors**: Updated to match new palette

## Icon Usage
- **Edit**: ✏️ (pencil emoji)
- **Delete**: 🗑️ (trash can emoji)
- **Remove**: ❌ (cross mark)
- **Calories**: 🔥 (fire)
- **Weight**: ⚖️ (balance scale)
- **Protein**: 💪 (flexed biceps)
- **Data Points**: 📊 (bar chart)

## Hover Effects & Animations

### Cards
- Slight elevation on hover (increased shadow)
- Fade-in animation on initial load (0.3s)

### Buttons
- Elevated shadow on hover
- Scale down (0.98) on active/click
- Smooth transitions (0.15s ease)

### Icon Buttons
- Color change to primary (teal) on hover
- Background: subtle teal background
- Scale up slightly (1.1)
- Danger icons: red color on hover

### Food Item Rows
- Slide right slightly (2px) on hover
- Enhanced shadow

## Accessibility Features
- High contrast text colors (WCAG AA compliant)
- Focus states on all interactive elements
- Proper hover states for all clickable items
- Large touch targets (minimum 44px)
- Semantic HTML structure

## Responsive Design
- Breakpoint at 768px for mobile devices
- Reduced spacing on mobile (16px instead of 24px)
- Smaller typography on mobile
- Flexible layouts with flexbox and wrapping

## Implementation
The design system is implemented through:
1. **CSS Variables** in `nutritional/assets/style.css` - Central design tokens
2. **Component Styles** - Specific styling for each UI component
3. **Utility Classes** - Reusable classes for common patterns
4. **Inline Styles** - For component-specific adjustments in Python code

## Future Enhancements
- Dark mode support
- Additional color themes
- More interactive animations
- Enhanced mobile experience
- Accessibility improvements (ARIA labels, screen reader support)
