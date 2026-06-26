# Game Design Document (GDD)

**Project Title:** Prism Shift

**Engine:** Construct 3

**Target Audience:** Game Jam Judges / Puzzle-Platformer Enthusiasts

**Visual Style:** Minimalist, High-Contrast Kinetic Geometry

---

## General
In GENERAL for all work: Do your work on a high-fidelity basis, don't do just good enough! that's important. Make the interactions feel good,
add vfx juice where applicable(take care of optimizing to not overload the CPU/GPU).
Don't take shortcuts to save on tokens or implementation time. After setting up the plan, write it down into a game-implementation-plan.md, where you can
refer to if tokens run out of something unexpected happens and you need to continue from somewhere.
I am aware this is a huge task, dont worry, just plan and execute it.

The game starts right into the first scene and has no usual main-menu.

The game needs to be fully responsive(all mobile orientations, min portrait sizes: 320x658px, tablet and desktop sizes) and optimized for mobile portrait and landscape play,
but also tablets and desktop(up to fullscreen). Dont use fixed pixels values if possible, use percentage or vw and vh to define size relations.
Take safe-area into account according to your skills. Take into account that images are
not selectable like in normal web environments, but allow drag and click events to perform game logic.
Be aware to make the optimized for web games standards like fast jump into the game by optimizing hot path loading and delay uncritical assets to load after
the game has started to show.

Save all state variables in one Object named prism_state.

## 1. Executive Summary & Core Loop

`Prism Shift` is a minimalist 2D puzzle-platformer where the player commands high mechanical depth. By toggling between a heavy, physical **Solid State** and a weightless, intangible **Phase State**, the player manipulates physics, vectors, and light beams to overload environmental power cores.

### The Core Loop

1. **Analyze:** Evaluate the layout of lethal light beams, movable blocks, and the target Core.
2. **Execute:** Navigate hazardous chasms by shifting states mid-air to dodge light or slide blocks.
3. **Solve:** Redirect or clear a path for a light beam to strike and charge the level's Core.

---

## 2. Object Registry & Asset Map (Construct 3 Layout)

Because this game relies on procedural feel ("juice") rather than bespoke art assets, every object is a primitive shape easily created using Construct 3’s built-in sprite editor.

| Object Name | Visual Asset Type | Behaviors Applied | Instance Variables |
| --- | --- | --- | --- |
| **Player** | $32 \times 32$ px Gray Square | Platform, Custom Movement, BoundToLayout | `isSolid` (Boolean, Default: True), `cachedVelocityY` (Number) |
| **Wall** | Variable px Black Rect | Solid, ShadowCaster | N/A |
| **MirrorBlock** | $48 \times 48$ px Dark Gray Square | Solid, Physics (or DragDrop for easier puzzle tuning) | N/A |
| **BeamSource** | $16 \times 16$ px White Square | N/A | N/A |
| **LightBeam** | $4 \times 4$ px White Square (stretched via code) | LineOfSight (or Raycast via custom expressions) | N/A |
| **Core** | $64 \times 64$ px White Outline Square | N/A | `chargeTime` (Number, Max: 2.0) |
| **DataShard** | $16 \times 16$ px Cyan Diamond | Rotate | `isCollected` (Boolean) |

---

## 3. Core Mechanics & State Machine

The entire game logic hinges on the Player's `isSolid` Boolean variable, triggered by pressing the `SPACEBAR`.

### State A: Solid State (`isSolid = True`)

* **Visuals:** Opacity = 100%. Crisp, drop-shadow active behind player.
* **Physics:** Platform behavior enabled. High deceleration, standard gravity ($1500$).
* **Interactions:** Can push `MirrorBlock` objects. Colliding with a `LightBeam` triggers **Instant Death / Room Reset**.

### State B: Phase State (`isSolid = False`)

* **Visuals:** Opacity = 40%. Soft cyan glow layer enabled.
* **Physics:** Platform behavior disabled. Custom Movement behavior enabled: Player floats upward slowly (Gravity = $-300$), moving horizontally with reduced drift.
* **Interactions:** Passes cleanly through `LightBeam` objects. Cannot push blocks (passes through them). Can overlap and collect `DataShard` objects.

---

## 4. Mechanics Progression System

### Progression Hook 1: Solid Redirect (Levels 1–3)

* **Logic:** The player must push `MirrorBlock` instances into the path of a `LightBeam`. The block acts as a physical barrier, casting a safe shadow zone behind it, allowing the player to navigate past otherwise impassable corridors.

### Progression Hook 2: Prism Refraction & Polarity (Levels 4–6)

* **Logic:** When `isSolid = False` (Phase State) and the Player overlaps a `LightBeam`, the beam does not kill them. Instead, a Construct 3 sub-event triggers:
```text
+ Player: Overlapping LightBeam
+ Player: isSolid = False
-> LightBeam: Set angle to Player.Angle + 90

```


* The player becomes a mobile prism, steering lethal energy safely into the Core.

### Progression Hook 3: Momentum Cache (Levels 7–9)

* **Logic:** Exploiting the physics engine state switch.
* When falling in Solid State, `Player.Platform.VectorY` increases rapidly.
* If the player switches to Phase State mid-air, the engine executes this script block:
```text
+ On SPACEBAR pressed
+ Player: isSolid is False
-> System: Set Player.cachedVelocityY to Player.Platform.VectorY
-> Player: Set CustomMovement VectorY to (Player.cachedVelocityY * -0.8)

```


* This inverts their downward falling velocity into a powerful, spring-like upward launch vector, enabling high-altitude puzzle scaling without introducing jump pads.


### Progression Hook 3: Momentum Cache (Levels 10+)
combination of all mechanism
all abilities unlocked, player must use all mechanics in tandem to solve complex puzzles and reach the Core.

---

## 5. Win Conditions & Systems

### Level Completion (Overloading the Core)

The Core functions as a smart directional switch.

* **Every Tick:** If `LightBeam` is overlapping `Core`, add `dt` (delta time) to `Core.chargeTime`. Create tiny white square particles bursting outwards.
* **Else:** Decelerate `Core.chargeTime` towards 0.
* **Condition:** If `Core.chargeTime >= 2.0`, trigger `System: Next Layout` with a fade-to-white transition effect.

### Collection System (Data Shards)

* **Condition:** If `Player` overlaps `DataShard` **AND** `isSolid` is `False`:
* Trigger particle explosion (Cyan palette).
* Add 1 to `ShardCount` global variable.
* Destroy `DataShard`.


* **Condition:** If `Player` overlaps `DataShard` **AND** `isSolid` is `True`:
* Treat `DataShard` as a solid wall obstacle (Player cannot pass through it until they shift states).



---

## 6. The "Juice" Layer (Game Jam Polish Polish)

To win a Construct 3 game jam with these low assets, implement these three built-in system visual effects to make the gameplay feel premium:

1. **Screen Shake on State Shift:** On hitting `SPACEBAR`, trigger a `ScrollTo: Shake` effect (Magnitude: 4, Duration: 0.1s). This makes the state shift feel incredibly impactful.
2. **The Glitch Death:** Upon death (Solid player touching light), do not simply restart. Apply the **Glitch** HTML5 effect to the entire background layer for 0.3 seconds, burst 50 black and white square particles out of the player's position, then reset the layout.
3. **Dynamic Shadows:** Put the background on Layer 0 (Light Gray). Put the Walls, Blocks, and Solid Player on Layer 1. Add the **Shadow Caster** behavior to Layer 1 objects, and place a light source object at the origin point of every `BeamSource`. Construct 3 will procedurally render dark, sweeping geometric shadows across the map in real-time as blocks move.

## 7. Visual Guideline
Slide 1-6 offer a visual guideline for the implementation.
Refer to: 
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide1_ground_zero.png"
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide2_environmental_rule.png"
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide3_kinetic_complexity.png"
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide4_maximum_polish.png"
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide5_mechanics_visualization.png"
- "C:\Users\konst\Documents\__p\construct\src\assets\art\slide6_mechanics_visualization.png"

## UI
show a UI/Level header with score(do we have score? Or should it be data shards instead?) like shown in "C:\Users\konst\Documents\__p\construct\src\assets\art\level-header.png"
but in the same style as in Prism Shift visual Guideline.

## Levels
add a level selector button that shows a clean and minimalistic, yet high fidelity
level selector modal so the player can replay old levels if wanted.

## Tutorial(don't add yet, will be added as a second step)
The game needs a quick, short, but highly effective tutorial that teaches the player the core mechanics and the state-shifting ability. The tutorial should be interactive, allowing players to practice shifting states
and interacting with light beams and blocks in a controlled environment. When a new mechanic is introduced/needed for a level,
introduce the mechanic with a short animated tutorial that avoids text-based instructions as much as possible.
Use visual cues, animations, and interactive elements to guide the player through the
learning process.

## After implementing the game
create a roadmap(min 15 features/action points, sorted by highest impact, best performance, highest game feel improvements)
for future features that would increase the Day1 retention, the average playtime, the easy-to-pickup and hard-to-put-down
metrics, that increase conversion of new players with actionable implementations suggestions. So that I can tackle these features later if I value them benefical.
