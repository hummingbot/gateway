# Session Notes for AI Agent

1. This branch was vased on main BUT we were supposed to make our changes in a https://github.com/VeXHarbinger/hummingbot-gateway.git branch of develop. which I created VeXHarbinger/hummingbot-gateway:pancakeswap-clmm-lp-bsc to house our pancakeswap/clmm/masterchef- endpoints and error/value fixes
2. So, if you can apply JUST those changed endpoint files to that repo, or another smart process, else we must create a migration document that
   1. lists the files changed specifically for our Pancakeswap endpoints
      1. We should also update the related swagger info.
   2. Has a section that lists all the changes we made to correct any value conversions or other value related errors.
   3. I believe that most of this is in gateway and api and I'll do this in those later to recreate the endpoints and their logic.
   4. Don't reference anything in .DesignDocs
3. We also need to include steps to test our changes in our PR so that the reviewer can test why these changes were needed.
4. We need to conform to the information listed in Contributing.md
5. When you are done please re-review this list and the resulting process to ensure that our end result will be focused to just the code changes we needed and none of the simple formatting or testing junk.
6. Once you feel 100% confident we've covered all of our changes we need to apply this to our pancakeswap-clmm-lp-bsc branch.  If you can accomplish this yourself via stashes or other wizardry please do so.
