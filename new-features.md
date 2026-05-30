## new features

### new grid obstacles
- a grid tile with a gate instead of the stone plate, the gate opens randomly for 1 second, then closes for 1 seconds.
- a grid tile with a trap, the trap is invisible until the player steps on it, then it pushes the player into the current move direction by 2 grid tiles.
- a grid tile with a spring, that launches the player ball to a random grid tile on the grid forwards when stepped on.

The overall game is fun and challenging.
But at the current amount of obstacles, the game is too hard for beginners,
even I cant get past 45 tiles travelled.
So we need to adjust the game difficulty, especially in the first 5 stages, where player
don't have skills yet and no upgrades bought.
Coin magnet upgrade increase 1 tile reach per level up.
Make the first upgrade level for each upgrade a lot cheaper(50%). 
Adjust BattlePass and dailyLoginModal rewards to the new gameplay.
in contrast to spin&mow where coins could be aquired fast with 
simply playing, the upgrade costs increased rapidly.
The current player can effectively get max ~40(with 2xRewardButton) on a successful run on stage 1.



Leave the current stage 1 as the test level enterable by using the
CTRL+ALT+SHIFT+t cheat from src/use/useCheats.ts. Also this level will be our stage 10 when difficulty will ramp up significantly.


Level 1 must be a very easy level to introduce the game mechanics, with only a few obstacles and a short path to the goal(20 tiles to finish level 1).
From level 2 more obstacles will be added, and the path to the goal will be longer, but the game should still be easy enough for beginners to complete(30 tiles to finish level 2).
From level 3, the game will be more challenging, with more obstacles and a longer path to the goal, but it should still be possible for beginners to complete with some practice(by this point all currently available types of obstacles are used except for the portal, so boxes, boulders, holes, lava and pyramids)(40 tiles to finish level 3).
From level 4, the game will be even more challenging,
with more obstacles and a longer path to the goal, but it should still be possible for beginners to complete with some practice(by this point all currently available types of obstacles are used). Each level adds 10 more tiles to travel to complete it.
figure out the other levels yourself.
On stage 1-5 the rolling speed is increasing from 100% to 130% over the length of the stage, so over 20 tiles in stage 1, the rolling speed will increase by 30%, meaning after 10 tiles the rolling speed has increased by 15% overall, etc..
Also from stage 6+ the rolling speed of the ball should increase up to 66% based on the starting rolling speed.