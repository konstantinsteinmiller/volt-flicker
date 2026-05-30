## new features

### new grid obstacles
- a grid tile with a gate instead of the stone plate, the gate opens randomly for 1 second, then closes for 1 seconds.
- a grid tile with a trap, the trap is invisible until the player steps on it, then it pushes the player into the current move direction by 2 grid tiles.
- a grid tile with a spring, that launches the player ball to a random grid tile on the grid forwards when stepped on.


Create a rubber band effect for the first 3 stages, so that players that struggle a lot, their tile goal per stage is reduces by 10% per failed attempt, down to a minimum of 50% from
the original goal. E.g. if a player has lost 4 times on stage 1, he only needs to pass 12 tiles to finish stage 1. This variable does not need to be tracked in localStorage or in sdks, its a session variable that is acceptably deleted on reload.

Read game-design.md and add a short description, a long descripition, and the goal of the game under the appropriate headings.
the cmarc debug unlock seems not to work, or at least it does not flip/set the debug localStorage property.

Add a SkinModal, that allows to buy different player ball skins for 500 coins each.
The skins textures are found under [models](public/images/models)


create a roadmap(min 15 features/action points) for future features that would increase the Day1 retention, the average playtime, the easy-to-pickup and hard-to-put-down
metrics, that increase conversion of new players with actionable implementations suggestions. So that I can tackle these features later if I value them benefical.




##Add a new upgrade as the very last upgrade called "time bubble". 
This upgrade has only 1 level and grants the ability to roll over 
the box obstacles without being affected by them as if you had the Push Force pickup.
This upgrade is a late game upgrade and should cost 10000 coins and not be 
acquirable with rewarded ads. the hint for this upgrade needs to be precise and short,
but easily understandable what it provides.




Add a leaderboard to the game with the LeaderboardButton and LeaderboardModal.
It displays the amount of tries you failed on the current stage. The Leaderboard show
