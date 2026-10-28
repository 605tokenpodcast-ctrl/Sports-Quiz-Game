// The rules screen.
import {Award} from 'lucide-react';
import {MenuOverlay} from '../utils/helper';
import {useGame} from '../game/GameContext';

export default function HowToPlay() {
  const {isHowToPlayOpen, setIsHowToPlayOpen, totalQuestionCount, totalCategoryCount} = useGame();
  return (
    <>
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={70}>
          <div className="w-full max-w-lg bg-slate-900 border-2 border-amber-400 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-lg sm:text-xl font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                HOW TO PLAY & ARENA RULES
              </h2>
              <button
                onClick={() => setIsHowToPlayOpen(false)}
                className="min-w-[44px] min-h-[44px] px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors">
                CLOSE
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300 leading-relaxed overflow-y-auto max-h-[60vh] pr-1">
              <div>
                <strong className="text-amber-400">🏈 All-NFL Categories:</strong>
                <p className="mt-0.5 text-slate-400">
                  <strong>{totalQuestionCount.toLocaleString()} NFL questions in {totalCategoryCount} categories</strong>, from Super Bowls and the draft to this week's games. Questions are rebuilt every week from nflverse data, and no question, category or answer repeats within a game.
                </p>
              </div>

              <div>
                <strong className="text-amber-400">🏷️ Custom Contestant Name & Tag:</strong>
                <p className="mt-0.5 text-slate-400">
                  Click the <strong>Edit Tag</strong> button or your name badge anytime to personalize your contestant name. Your custom name tag is instantly saved and shared to leaderboards and multiplayer rooms.
                </p>
              </div>

              <div>
                <strong className="text-amber-400">🏆 Hall of Champions Multi-Tier Leaderboards:</strong>
                <p className="mt-0.5 text-slate-400">
                  Every match automatically qualifies for its combination of <strong>Opponent Mode</strong> (Rookie AI, Pro AI, All-Star AI, Legend AI, Pass & Play, Online Duel) + <strong>Trivia Tier</strong> + <strong>Answer Format</strong>! Check your ranks anytime.
                </p>
              </div>

              <div>
                <strong className="text-emerald-400">1. Cross-Device Multiplayer (Phone + Host):</strong>
                <p className="mt-0.5 text-slate-400">
                  Click <strong>Invite / Duel</strong> to generate a room QR code. Friends can scan on their smartphone or enter the code to play directly on their own device with a dedicated buzzer gamepad!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">2. Board Control (Selection Turn):</strong>
                <p className="mt-0.5 text-slate-400">
                  The contestant who correctly answers a clue wins control of the board and chooses the next clue tile!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">3. Daily Double Hidden Wagers:</strong>
                <p className="mt-0.5 text-slate-400">
                  Round 1 features <strong>1 Daily Double</strong>; Round 2 features <strong>2 Daily Doubles</strong> (just 1 in a Short Game). When picked, the clue is <strong>hidden and classified</strong> until the contestant confirms their strategic cash wager!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">4. Buzzer Timing:</strong>
                <p className="mt-0.5 text-slate-400">
                  Wait for the host light to turn active. Buzz with Spacebar, Enter, screen button, or mobile gamepad!
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsHowToPlayOpen(false)}
              className="min-w-[48px] min-h-[48px] mt-4 w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-colors shadow">
              GOT IT, LET'S PLAY
            </button>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
