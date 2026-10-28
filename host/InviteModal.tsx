// Inviting friends: QR code and room code, pass and play, or joining another game.
import {RotateCw, Users, Share2, Copy, Smartphone, QrCode, ExternalLink, Gamepad2, Tv} from 'lucide-react';
import {gameAudio, MenuOverlay} from '../utils/helper';
import {QRCodeView} from '../ui/shared';
import {useGame} from '../game/GameContext';

export default function InviteModal() {
  const {
    setDeviceRole,
    roomCode,
    setRoomCode,
    joinInputCode,
    setJoinInputCode,
    isClientConnected,
    inviteModalTab,
    setInviteModalTab,
    isInviteModalOpen,
    setIsInviteModalOpen,
    isTwoPlayerMode,
    setIsTwoPlayerMode,
    showToast,
    shareableJoinUrl,
    generateRoomCode,
    handleCopyInviteLink,
    handleCopyRoomCode,
    streamScreenUrl,
    screenCount,
  } = useGame();
  return (
    <>
      {isInviteModalOpen && (
        <MenuOverlay tone="neutral" zIndex={80}>
          <div className="w-full max-w-lg bg-slate-900 border-2 border-emerald-400 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col text-left max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-6 h-6 text-emerald-400" />
                <div>
                  <h2 className="text-base sm:text-lg font-black text-emerald-400 uppercase tracking-wider">
                    PLAY ON SEPARATE DEVICES
                  </h2>
                  <div className="text-[10px] text-slate-400">
                    Host a game & scan QR or join from another phone / PC!
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="min-w-[40px] min-h-[40px] px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors">
                CLOSE
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1.5 mb-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setInviteModalTab('separate')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'separate'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <QrCode className="w-3.5 h-3.5" />
                <span>Host (QR Code)</span>
              </button>

              <button
                onClick={() => setInviteModalTab('join')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'join'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Join Code</span>
              </button>

              <button
                onClick={() => setInviteModalTab('pass_play')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'pass_play'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Users className="w-3.5 h-3.5" />
                <span>Pass & Play</span>
              </button>
            </div>

            {/* TAB 1: HOST GAME & SCANNABLE QR CODE */}
            {inviteModalTab === 'separate' && (
              <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300">
                {/* Live Connection Status Badge */}
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isClientConnected
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                    : 'bg-slate-950 border-amber-500/50 text-amber-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isClientConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                    <span className="font-bold">
                      {isClientConnected ? '🟢 Friend Connected: Player 2 Ready!' : '🟡 Waiting for friend to scan QR...'}
                    </span>
                  </div>
                  <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 font-mono">
                    {roomCode}
                  </span>
                </div>

                {/* QR Code + Instructions */}
                <div className="bg-slate-950 p-4 rounded-xl border border-blue-900/60 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                  <div className="shrink-0">
                    <QRCodeView value={shareableJoinUrl} size={160} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-black text-amber-300 uppercase">
                      1. Scan with Phone Camera
                    </div>
                    <p className="text-[11px] text-slate-300 leading-tight">
                      Open your smartphone camera and point at the QR code to instantly join this match as Player 2!
                    </p>
                    <div className="text-xs font-black text-amber-300 uppercase mt-1">
                      2. Or Share Direct Link
                    </div>
                    <button
                      onClick={handleCopyInviteLink}
                      className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow transition-all active:scale-95">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>COPY SHAREABLE JOIN LINK</span>
                    </button>
                  </div>
                </div>

                {/* Room Code & Quick Test buttons */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Room Code</div>
                    <div className="text-base font-black text-white font-mono">{roomCode}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={generateRoomCode}
                      className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                      title="Generate New Room Code">
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCopyRoomCode}
                      className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 shadow">
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </button>
                    <a
                      href={shareableJoinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Test New Tab</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Stream screen: a big-screen view for a laptop or TV, which only watches */}
            {inviteModalTab === 'separate' && (
              <div className="mt-3 bg-slate-950 p-3 rounded-xl border border-blue-700/60 flex flex-col gap-2 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-blue-200 uppercase">
                    <Tv className="w-4 h-4 text-amber-400" />
                    <span>Stream Screen</span>
                  </div>
                  <span className={`text-[10px] font-bold ${screenCount ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {screenCount ? '🟢 Connected' : 'Not connected'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Streaming or recording? Open this link on a laptop or TV for a big board with the clues, scores and join QR code.
                  Everyone still plays from their phone. It doesn't take a player seat.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      navigator.clipboard
                        .writeText(streamScreenUrl)
                        .then(() => showToast('✓ Stream screen link copied!'))
                        .catch(() => showToast(streamScreenUrl))
                    }
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                    <span>COPY STREAM LINK</span>
                  </button>
                  <a
                    href={streamScreenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </a>
                </div>
              </div>
            )}

            {/* TAB 2: JOIN A FRIEND'S HOSTED ROOM */}
            {inviteModalTab === 'join' && (
              <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300">
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/40 flex flex-col gap-3">
                  <div className="text-xs font-bold text-emerald-300 uppercase">
                    Enter Friend's 4-6 Digit Room Code
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. SPORT-1234"
                      value={joinInputCode}
                      onChange={(e) => setJoinInputCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-slate-900 border-2 border-emerald-400 px-3 py-2 text-white font-black text-center rounded-lg text-base uppercase tracking-widest"
                    />
                    <button
                      onClick={() => {
                        const sanitized = joinInputCode.trim();
                        if (sanitized) {
                          setRoomCode(sanitized);
                          setDeviceRole('CLIENT');
                          setIsInviteModalOpen(false);
                          showToast(`Connecting to Room ${sanitized}...`);
                        } else {
                          showToast('Please enter a room code');
                        }
                      }}
                      className="px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-sm shadow">
                      CONNECT
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Connecting switches this browser window into the Player 2 controller view.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PASS & PLAY SAME DEVICE */}
            {inviteModalTab === 'pass_play' && (
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 flex flex-col gap-3">
                <div className="text-xs text-amber-300 font-bold uppercase">Same-Device Pass & Play Duel</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Play head-to-head on this single device screen! P1 and P2 take turns selecting clue tiles and buzzing with Spacebar (P1) and Enter (P2) or screen tap buttons.
                </p>
                <button
                  onClick={() => {
                    setIsTwoPlayerMode((prev) => !prev);
                    gameAudio.playConfirmSelect();
                    showToast(isTwoPlayerMode ? 'Switched to Solo Champion' : '2-Player Duel Mode Enabled!');
                  }}
                  className={`min-h-[44px] py-2 px-3 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    isTwoPlayerMode
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-200 border border-slate-700'
                  }`}>
                  <Users className="w-4 h-4" />
                  <span>{isTwoPlayerMode ? '✓ 2-PLAYER PASS & PLAY ACTIVE' : 'ENABLE 2-PLAYER PASS & PLAY'}</span>
                </button>
              </div>
            )}

            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="min-w-[48px] min-h-[48px] mt-4 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm transition-colors shadow">
              DONE
            </button>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
