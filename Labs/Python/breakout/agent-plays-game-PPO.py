# Script:  Breakout, Game (loads saved model and plays)
# By:      Bob Gruen
# Started: Saturday, December 2, 2023
 
import gym
import numpy as np
import time

from stable_baselines3 import PPO

# Import Frame Stacker Wrapper and Grayscaling Wrapper
from gym.wrappers import GrayScaleObservation 

# Import Vectorization Wrappers
from stable_baselines3.common.vec_env import VecFrameStack, DummyVecEnv

model = PPO.load('model-ppo-cnn-250000')
 
# create environment
env = gym.make('ALE/Breakout-v5', obs_type='grayscale', frameskip=4, render_mode='human')

env = GrayScaleObservation(env, keep_dim=True)
env = DummyVecEnv([lambda: env])
env = VecFrameStack(env, 4)

state = env.reset()

env.render()

# simulate the environment
episodeNumber = 10
bestEpisode = 0
bestScore = 0
 
for episodeIndex in range(episodeNumber):
    episodeSteps = 0
    episodeScore = 0
    print("\n--------------------------------------------------------------------------------------------------\n")
    print("GAME #: " + str(episodeIndex) + '\n')
    env.render()
    appendedObservations=[]
    terminated = False
    
    while not terminated: 
        #print("STEP #: " + str(episodeSteps))
        
		# Use the trained model for the action
        action, _ = model.predict(state, deterministic=False)

        state, reward, terminated, _ = env.step(action)

        reward_this_step = int(reward[0])
        episodeScore = episodeScore + reward_this_step
        
        appendedObservations.append(state)
        episodeSteps = episodeSteps + 1
        time.sleep(0.1)
        
        if terminated:
            time.sleep(2)
            # break

    print("TOTAL SCORE THIS LOOP: " + str(episodeScore))

    if(episodeScore > bestScore):
        bestScore = episodeScore
        bestEpisode = episodeIndex

print("BEST GAME: " + str(bestEpisode))
print("BEST SCORE: " + str(bestScore))

env.close()