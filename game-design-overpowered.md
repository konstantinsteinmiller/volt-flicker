## Game Design Document: Project Volt-Flicker (Working Title)

---

## 1. Game Overview

### 1.1 Core Concept

*Project Volt-Flicker* is a fast-paced, high-stakes puzzle-platformer where **energy is everything**. The player controls a dynamic, lightning-based entity whose health, ammo, and visual form are all tied directly to a single resource: **Volt**. Survival requires balancing speed, aggressive energy consumption, and tactical power management across hazardous environments.

### 1.2 Core Pillars

* **Resource Asymmetry (High Risk, High Reward):** Massive, screen-clearing attacks are accessible at almost any time, but using them brings the player dangerously close to instant death.
* **Speed vs. Precision:** A constant passive energy drain forces momentum, while tight platforming puzzles require calculated skill usage.
* **Visual Synergy:** The user interface is deeply integrated into the main character asset—as power fades, the character physically dulls and shrinks, creating intuitive, tense gameplay.

---

## 2. Core Mechanics & Resource Systems

### 2.1 The Volt System (Health & Ammo)

The player does not have a traditional health bar. Instead, they have a **Volt Meter (0% – 100%)**.

* **Passive Decay:** The player loses a fixed **0.5% Volt per second** of active gameplay. A level must be completed efficiently to prevent total depletion.
* **Death State:** Reaching **0% Volt** immediately triggers a game over ("The Final Flicker").
* **Damage Intake:** Getting hit by generic enemies or hazards depletes Volt instantly.
* **Dynamic Feedback:** The player character is a lightning ball surrounded by programmatically generated, high-fidelity lightning arcs.
* **At 100% Volt:** Glowing intensely, long energetic arcs, high-frequency crackle.
* **At Decaying Volt:** Arcs become shorter, less frequent, and the core ball loses shininess, turning a dull, powerless gray/blue near 0%.



### 2.2 Collectibles

To counteract decay and skill costs, players must hunt for energy capsules placed throughout levels or dropped by specific encounters:

* **Small Energy Capsule:** Replenishes **+10% Volt**.
* **Big Energy Capsule:** Replenishes **+30% Volt**.

---

## 3. Character Controller & Skills

### 3.1 Movement (Skill 3)

Movement is nimble, fluid, and heavily inspired by classic action-platformers. Normal walking and running do not cost energy.

* **Jump / Double Jump:** Pressing `Space`. Standard physics-based platforming verticality.
* **Wall Slide & Wall Jump:** Sliding down vertical surfaces slows descent. Pressing `Space` while sliding executes a wall jump.
* **Lightning Dash:** Pressing `Space` twice rapidly triggers a forward dash.
* **Visual:** The player transforms into a sharp, instant lightning bolt.
* **Utility:** Can be executed mid-air to cross massive gaps or dodge hazards.
* **Cost:** **2.5% Volt** per dash.



### 3.2 Skill 1: Directed Plasma Beam (Left Click)

A charge-based offensive laser fired from the player's arm.

* **Quick Tap:** Fires a small, short-range projectile dealing low damage.
* *Cost:* **2.5% Volt**.


* **Fluid Scaling Charge:** Holding `Left Click` scales up the visual size and potential damage of the laser fluidly after a minimum **0.5-second** hold.
* **Max Power Discharge (4-Second Hold):** At full charge, the player unleashes an overpowered screen-clearing laser.
* *Properties:* Horizontally covers the entire screen; vertically covers 50% of the screen. It collides with and is stopped by walls.
* *Damage:* **100x base damage** (instantly obliterates all standard enemies).
* *Cost:* **50% Volt**. *Warning:* Firing this with 50% or less Volt results in instant death.



### 3.3 Skill 2: Radial Electrical Discharge (Right Click)

An Area of Effect (AoE) blast emanating outward from the player core. Primarily used for combat control and environment interaction.

* **Quick Tap:** A small, short-range radial burst.
* *Utility:* Can pass through solid walls to trigger switches, buttons, or traps on the other side.
* *Cost:* **5% Volt**.


* **Charged Screen Burst:** Holding `Right Click` expands the radius over time. At maximum charge, it triggers an explosion affecting **the entire screen** (detonating all traps, activating all buttons, damaging all enemies).
* *Cost:* Scales up to a maximum of **30% Volt**.



---

## 4. Environment & Hazard Objects

To maximize visual asset efficiency, environmental objects utilize primitive geometry paired with distinct behavior states.

| Object Type | Visual Form | Mechanics & Behavior |
| --- | --- | --- |
| **Basic Enemy** | Triangles / Squares | Patrols or floats in designated areas. Damages player on contact. |
| **Traps** | Colored Rectangles | Static or timed hazards. On contact, they explode into heavy particle effects and **suck 20% Volt** instantly from the player. |
| **Buttons / Switches** | Colored Rectangles | Interactable nodes. Must be hit by Skill 1 or Skill 2 to open doors, move platforms, or disable traps. |

---

## 5. Level Design & Campaign Flow

### 5.1 Level 1: "Max Power & Core Mechanics" (Tutorial)

* **Design:** A linear puzzle-platforming stage with no text instructions.
* **Tutorialization:** * The player encounters a massive wall or an ultra-durable enemy blocking the path completely.
* An environmental background graphic displays a simple, textless silhouette animation of a mouse icon with the **Left Click button highlighted and held down**, followed by an explosion graphic.
* This teaches the player to use the 4-second **Max Power Discharge** to proceed.


* **Pacing:** Plentiful small energy capsules to ensure players can experiment with the high-cost laser without immediately dying.

### 5.2 Level 2: "The Spatial Discharge"

* **Design:** A maze-like layout prioritizing vertical movement, wall-sliding, and hidden paths.
* **Tutorialization:** Introduce puzzles where progression routes are blocked by heavy gates, but the activation button is clearly visible *behind* a solid wall.
* Prompts the natural realization that the **Right Click (Skill 2)** radial blast bypasses geometry to activate switches.


* **Pacing:** Introduction of standard traps. Players must balance dashing over gaps and saving energy to trigger distant puzzle components.

### 5.3 Level 3: "The Final Flicker" (Boss Encounter)

* **Design:** A single, large arena stage featuring a massive mechanical boss.
* **Boss Behavior:** The boss constantly floods the screen with dense patterns of small, dodging-focused projectles.
* **Combat Loop:** * Standard attacks deal negligible damage to the boss's armored plating.
* The player *must* find windows of safety to charge and land **3 fully-charged Overpowered Shots (Skill 1)**.
* To prevent the player from running out of energy due to the 50% cost, each successful Overpowered Shot hit cracks the boss's armor, forcing it to **drop multiple Big Energy Capsules (+30% Volt each)** to fuel the next phase of the fight.

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

---

## 7. Visual Guideline
Slide 1 offer a visual guideline for the implementation.
Refer to: 
- "C:\Users\konst\Documents\__p\volt-flicker\src\assets\art\slide1.png"

## UI
show a UI/Level header with volt [0,100] similar to like its shown in "C:\Users\konst\Documents\__p\volt-flicker\src\assets\art\level-header.png"
but in the same style as in Volt-Flicker visual Guideline.

## Dying
Death results in a respawn at the current levels spawn point.


## After implementing the game
create a roadmap(min 15 features/action points, sorted by highest impact, best performance, highest game feel improvements)
for future features that would increase the Day1 retention, the average playtime, the easy-to-pickup and hard-to-put-down
metrics, that increase conversion of new players with actionable implementations suggestions. So that I can tackle these features later if I value them benefical.
