---
name: WhatsCRM AI Professional
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434656'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#004ced'
  primary: '#003ec7'
  on-primary: '#ffffff'
  primary-container: '#0052ff'
  on-primary-container: '#dfe3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#3f4f65'
  on-tertiary: '#ffffff'
  tertiary-container: '#57677e'
  on-tertiary-container: '#d6e6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001452'
  on-primary-fixed-variant: '#0038b6'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-max: 1440px
  gutter: 24px
  margin-page: 32px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 24px
  unit-xl: 48px
---

## Brand & Style
The design system is rooted in **Modern Corporate** aesthetics, blending the utilitarian precision of developer tools with the approachability required for small business owners. The goal is to evoke a sense of organized efficiency and reliable intelligence.

Drawing inspiration from high-end SaaS platforms, the interface prioritizes clarity and information density without overwhelming the user. It utilizes a **Minimalist** foundation with **Tonal Layering**, where whitespace is treated as a functional tool to separate concerns. The visual language avoids decorative flourishes, focusing instead on crisp execution, intentional alignment, and a "desktop-first" productivity mindset.

## Colors
The palette is built on a foundation of "Zinc" and "Slate" neutrals to provide a sophisticated, calm backdrop. 

- **Primary:** A vibrant, modern blue (#0052FF) reserved for primary actions, active states, and critical paths.
- **Secondary:** A deep navy slate (#0F172A) used for high-contrast text and the sidebar background to establish a clear structural hierarchy.
- **Surface Scale:** Employs a range of very light grays (Slate 50 to Slate 200) to differentiate the background from containers and input fields.
- **Semantic Colors:** Success (Emerald), Warning (Amber), and Error (Rose) should be used in desaturated tones to maintain the professional atmosphere.

## Typography
The typography system uses a dual-sans approach to maximize legibility and professional character. 

**Hanken Grotesk** is used for headlines to provide a sharp, contemporary edge. **Inter** handles all body and UI text due to its exceptional readability at small sizes. **JetBrains Mono** is utilized sparingly for labels, metadata, and ID strings to reinforce the "systematic" nature of a CRM. 

Tighten letter-spacing on larger headings to maintain a "premium" feel. For data-heavy tables, use `body-md` to ensure high information density.

## Layout & Spacing
This design system follows a **Fixed-Fluid Hybrid** model. The primary navigation is a fixed-width left sidebar (260px), while the main content area resides in a fluid container with a maximum width of 1440px to prevent excessive line lengths on ultra-wide monitors.

Spacing follows an 8px base grid. 
- **Desktop:** Use 32px page margins and 24px gutters for grid layouts.
- **Tablet:** Reduce margins to 24px; the sidebar may collapse into an icon-only rail (72px).
- **Mobile:** Single column layout with 16px horizontal margins.

Layouts should prioritize vertical rhythm, using `unit-lg` to separate major sections and `unit-sm` for related internal elements.

## Elevation & Depth
Elevation is expressed primarily through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Background):** Slate 50 (#F8FAFC). The canvas.
- **Level 1 (Cards/Surface):** White (#FFFFFF). Uses a 1px border of Slate 200 (#E2E8F0).
- **Level 2 (Popovers/Modals):** White (#FFFFFF) with a soft, diffused ambient shadow: `0 10px 15px -3px rgba(0, 0, 0, 0.05)`.
- **Active States:** Subtle inner shadows or a 2px primary-colored border-left for active sidebar items.

Avoid using shadows for standard buttons; keep them flat with crisp borders to maintain the "Linear-style" professional aesthetic.

## Shapes
The shape language is **Soft (0.25rem)** to maintain a disciplined, architectural feel. 

- **Small Components:** Checkboxes, small buttons, and tags use `rounded` (4px).
- **Large Components:** Cards, input fields, and modals use `rounded-lg` (8px).
- **Special Cases:** Search bars and specific status badges may use `rounded-xl` (12px) but never full pills, to avoid looking too "consumer-oriented" or "playful."

## Components

- **Buttons:** Primary buttons use the modern blue background with white text. Secondary buttons use a white background with a Slate 200 border. Both should have a subtle 1px "top-light" border to give a very slight tactile feel.
- **Input Fields:** Use a white background, 1px Slate 300 border, and `Inter body-md`. The focus state should use a 2px blue ring with 0% offset.
- **Sidebar Navigation:** Dark mode by default (#0F172A). Nav items should have an 8px horizontal padding and use `Inter body-md`. Active items use a subtle background tint (white at 10% opacity).
- **Data Tables:** Borderless rows with 1px Slate 100 bottom dividers. Header cells use `label-md` (JetBrains Mono) in all-caps with a Slate 500 color.
- **Chips/Badges:** Use a light tonal fill (e.g., light blue background with dark blue text) rather than high-contrast solid colors.
- **Cards:** White background, 1px Slate 200 border, and no shadow unless hovered.
- **Sidebar AI Summary:** A dedicated section in the sidebar with a subtle gradient border (Primary Blue to Indigo) to indicate AI-driven content without using chat bubbles.