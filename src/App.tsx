import {
  useEffect,
  useRef,
  useState,
} from "react";

import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";

import "./App.css";

const socket = io();

type Player = {
  id: string;
  name: string;
  hasSubmitted: boolean;
  score: number;
};

type Opinion = {
  id: string;
  text: string;

  authorId?: string | null;
  authorName?: string;

  isFiller?: boolean;

  wins?: number;
  totalVotes?: number;
};

type GameState =
  | "lobby"
  | "submitting"
  | "preparing"
  | "voting"
  | "finished";

type MatchData = {
  opinionA: Opinion;
  opinionB: Opinion;

  roundNumber: number;
  matchIndex: number;

  totalOpinions: number;

  endsAt: number;
};

function getRoundName(
  roundNumber: number,
  totalOpinions: number
) {
  const totalRounds =
    Math.log2(totalOpinions);

  const remaining =
    totalRounds -
    roundNumber +
    1;

  if (remaining === 1) {
    return "Final";
  }

  if (remaining === 2) {
    return "Semi Final";
  }

  if (remaining === 3) {
    return "Quarter Final";
  }

  return `Round of ${Math.pow(
    2,
    remaining
  )}`;
}

function App() {
  const [roomCode, setRoomCode] =
    useState("");

  const [
    playerName,
    setPlayerName,
  ] = useState("");

  const [
    hostRoomCode,
    setHostRoomCode,
  ] = useState("");

  const [
    joinedRoomCode,
    setJoinedRoomCode,
  ] = useState("");

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [
    gameState,
    setGameState,
  ] =
    useState<GameState>(
      "lobby"
    );

  const [
    submittedCount,
    setSubmittedCount,
  ] = useState(0);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    opinionOne,
    setOpinionOne,
  ] = useState("");

  const [
    opinionTwo,
    setOpinionTwo,
  ] = useState("");

  const [
    extraOpinions,
    setExtraOpinions,
  ] =
    useState<string[]>([]);

  const [
    hasSubmittedOpinions,
    setHasSubmittedOpinions,
  ] = useState(false);

  const [
    currentMatch,
    setCurrentMatch,
  ] =
    useState<MatchData | null>(
      null
    );

  const [
    selectedVote,
    setSelectedVote,
  ] =
    useState<string | null>(
      null
    );

  const [
    selectedGuesses,
    setSelectedGuesses,
  ] = useState<
    Record<string, string>
  >({});

  const [
    roundSubmitted,
    setRoundSubmitted,
  ] = useState(false);

  const [
    secondsLeft,
    setSecondsLeft,
  ] = useState(10);

  const [
    votingProgress,
    setVotingProgress,
  ] = useState({
    submitted: 0,
    total: 0,
  });

  const [
    matchResult,
    setMatchResult,
  ] = useState<{
    votesA: number;
    votesB: number;
    winner: Opinion;
  } | null>(null);

  const [
    gameWinner,
    setGameWinner,
  ] =
    useState<Opinion | null>(
      null
    );

  const [
    finalRankings,
    setFinalRankings,
  ] =
    useState<Opinion[]>([]);

  const [
    finalPlayers,
    setFinalPlayers,
  ] =
    useState<Player[]>([]);

  const [
    revealAuthors,
    setRevealAuthors,
  ] = useState(false);

  const autoSubmittedRef =
    useRef(false);

  useEffect(() => {
    const parts =
      window.location.pathname.split(
        "/"
      );

    if (
      parts[1] === "join" &&
      parts[2]
    ) {
      setRoomCode(
        parts[2].toUpperCase()
      );
    }
  }, []);

  useEffect(() => {
    if (!currentMatch) {
      return;
    }

    const updateTimer = () => {
      const milliseconds =
        currentMatch.endsAt -
        Date.now();

      const seconds =
        Math.max(
          0,
          Math.ceil(
            milliseconds / 1000
          )
        );

      setSecondsLeft(seconds);
    };

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        100
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    currentMatch?.endsAt,
  ]);

  useEffect(() => {
    if (
      secondsLeft !== 0 ||
      !currentMatch ||
      roundSubmitted ||
      !selectedVote ||
      autoSubmittedRef.current
    ) {
      return;
    }

    autoSubmittedRef.current =
      true;

    submitCurrentRound(true);
  }, [
    secondsLeft,
    currentMatch,
    roundSubmitted,
    selectedVote,
  ]);

  useEffect(() => {
    const handleRoomUpdated = (
      data: {
        players: Player[];
        gameState: GameState;
        submittedCount: number;
      }
    ) => {
      setPlayers(
        data.players
      );

      setGameState(
        data.gameState
      );

      setSubmittedCount(
        data.submittedCount
      );
    };

    const handleGameStateChanged =
      (data: {
        gameState: GameState;
      }) => {
        setGameState(
          data.gameState
        );
      };

    const handleMatchStarted =
      (data: MatchData) => {
        setCurrentMatch(
          data
        );

        setGameState(
          "voting"
        );

        setSelectedVote(
          null
        );

        setSelectedGuesses(
          {}
        );

        setRoundSubmitted(
          false
        );

        setMatchResult(
          null
        );

        setSecondsLeft(
          10
        );

        autoSubmittedRef.current =
          false;
      };

    const handleVotingProgress =
      (data: {
        submitted: number;
        total: number;
      }) => {
        setVotingProgress(
          data
        );
      };

    const handleMatchResult =
      (data: {
        votesA: number;
        votesB: number;
        winner: Opinion;
      }) => {
        setMatchResult(
          data
        );
      };

    const handleScoresUpdated =
      (data: {
        players: Player[];
      }) => {
        setPlayers(
          data.players
        );

        setFinalPlayers(
          data.players
        );
      };

    const handleGameFinished =
      (data: {
        winner: Opinion;
        rankings: Opinion[];
        players: Player[];
        revealAuthors: boolean;
      }) => {
        setGameWinner(
          data.winner
        );

        setFinalRankings(
          data.rankings
        );

        setFinalPlayers(
          data.players
        );

        setRevealAuthors(
          data.revealAuthors
        );

        setGameState(
          "finished"
        );
      };

    const handleAuthorsRevealed =
      (data: {
        revealAuthors: boolean;
      }) => {
        setRevealAuthors(
          data.revealAuthors
        );
      };

    const handleRoomClosed =
      () => {
        alert(
          "The host ended the room."
        );

        window.location.href =
          "/";
      };

    socket.on(
      "room-updated",
      handleRoomUpdated
    );

    socket.on(
      "game-state-changed",
      handleGameStateChanged
    );

    socket.on(
      "match-started",
      handleMatchStarted
    );

    socket.on(
      "voting-progress",
      handleVotingProgress
    );

    socket.on(
      "match-result",
      handleMatchResult
    );

    socket.on(
      "scores-updated",
      handleScoresUpdated
    );

    socket.on(
      "game-finished",
      handleGameFinished
    );

    socket.on(
      "authors-revealed",
      handleAuthorsRevealed
    );

    socket.on(
      "room-closed",
      handleRoomClosed
    );

    return () => {
      socket.off(
        "room-updated",
        handleRoomUpdated
      );

      socket.off(
        "game-state-changed",
        handleGameStateChanged
      );

      socket.off(
        "match-started",
        handleMatchStarted
      );

      socket.off(
        "voting-progress",
        handleVotingProgress
      );

      socket.off(
        "match-result",
        handleMatchResult
      );

      socket.off(
        "scores-updated",
        handleScoresUpdated
      );

      socket.off(
        "game-finished",
        handleGameFinished
      );

      socket.off(
        "authors-revealed",
        handleAuthorsRevealed
      );

      socket.off(
        "room-closed",
        handleRoomClosed
      );
    };
  }, []);

  const handleHostGame =
    () => {
      socket.emit(
        "create-room",
        (response: {
          success: boolean;
          roomCode: string;
        }) => {
          if (
            response.success
          ) {
            setHostRoomCode(
              response.roomCode
            );
          }
        }
      );
    };

  const handleJoinGame =
    () => {
      setErrorMessage("");

      if (
        !playerName.trim()
      ) {
        setErrorMessage(
          "Enter your name."
        );

        return;
      }

      if (
        !roomCode.trim()
      ) {
        setErrorMessage(
          "Enter a room code."
        );

        return;
      }

      socket.emit(
        "join-room",
        {
          roomCode:
            roomCode
              .trim()
              .toUpperCase(),

          playerName:
            playerName.trim(),
        },

        (response: {
          success: boolean;
          roomCode?: string;
          players?: Player[];
          message?: string;
        }) => {
          if (
            !response.success
          ) {
            setErrorMessage(
              response.message ??
                "Unable to join."
            );

            return;
          }

          setJoinedRoomCode(
            response.roomCode ??
              ""
          );

          setPlayers(
            response.players ??
              []
          );
        }
      );
    };

  const handleStartGame =
    () => {
      socket.emit(
        "start-game",
        {
          roomCode:
            hostRoomCode,
        },

        (response: {
          success: boolean;
          message?: string;
        }) => {
          if (
            !response.success
          ) {
            setErrorMessage(
              response.message ??
                "Unable to start."
            );
          }
        }
      );
    };

  const addExtraOpinion =
    () => {
      setExtraOpinions(
        (current) => [
          ...current,
          "",
        ]
      );
    };

  const updateExtraOpinion =
    (
      index: number,
      value: string
    ) => {
      setExtraOpinions(
        (current) =>
          current.map(
            (
              opinion,
              opinionIndex
            ) =>
              opinionIndex ===
              index
                ? value
                : opinion
          )
      );
    };

  const handleSubmitOpinions =
    () => {
      const opinions = [
        opinionOne,
        opinionTwo,
        ...extraOpinions,
      ];

      socket.emit(
        "submit-opinions",
        {
          roomCode:
            joinedRoomCode,

          opinions,
        },

        (response: {
          success: boolean;
          message?: string;
        }) => {
          if (
            !response.success
          ) {
            setErrorMessage(
              response.message ??
                "Unable to submit."
            );

            return;
          }

          setHasSubmittedOpinions(
            true
          );
        }
      );
    };

  function submitCurrentRound(
    automatic = false
  ) {
    if (
      !selectedVote ||
      roundSubmitted
    ) {
      return;
    }

    setRoundSubmitted(true);

    socket.emit(
      "submit-round",
      {
        roomCode:
          joinedRoomCode,

        opinionId:
          selectedVote,

        guesses:
          selectedGuesses,
      },

      (response: {
        success: boolean;
        message?: string;
        guessResults?: Array<{
          opinionId: string;
          correct: boolean;
          points: number;
        }>;
      }) => {
        if (
          !response.success
        ) {
          if (!automatic) {
            setErrorMessage(
              response.message ??
                "Unable to submit."
            );
          }
        }
      }
    );
  }

  const toggleGuess = (
    opinionId: string,
    playerId: string
  ) => {
    if (roundSubmitted) {
      return;
    }

    setSelectedGuesses(
      (current) => {
        if (
          current[
            opinionId
          ] === playerId
        ) {
          const updated = {
            ...current,
          };

          delete updated[
            opinionId
          ];

          return updated;
        }

        return {
          ...current,
          [opinionId]:
            playerId,
        };
      }
    );
  };

  const toggleAuthors =
    () => {
      socket.emit(
        "toggle-reveal-authors",
        {
          roomCode:
            hostRoomCode,
        }
      );
    };

  const joinUrl =
    hostRoomCode
      ? `${window.location.origin}/join/${hostRoomCode}`
      : "";

  const isHost =
    Boolean(hostRoomCode);

  const renderPlayerChips = (
    opinion: Opinion
  ) => {
    if (
      opinion.isFiller ||
      isHost
    ) {
      return null;
    }

    return (
      <div className="guess-area">
        <span className="guess-caption">
          Optional: who wrote this?
        </span>

        <div className="player-chips">
          {players
            .filter(
              (player) =>
                player.id !==
                socket.id
            )
            .map(
              (player) => {
                const selected =
                  selectedGuesses[
                    opinion.id
                  ] ===
                  player.id;

                return (
                  <button
                    type="button"
                    key={
                      player.id
                    }
                    className={`player-chip ${
                      selected
                        ? "player-chip-selected"
                        : ""
                    }`}
                    onClick={() =>
                      toggleGuess(
                        opinion.id,
                        player.id
                      )
                    }
                    disabled={
                      roundSubmitted
                    }
                  >
                    {
                      player.name
                    }
                  </button>
                );
              }
            )}
        </div>
      </div>
    );
  };

  if (
    gameState ===
      "finished" &&
    gameWinner
  ) {
    return (
      <main className="app-shell results-page">
        <section className="results-card">
          <div className="winner-section">
            <p className="subtitle">
              Most Unpopular Opinion
            </p>

            <div className="winner-trophy">
              🏆
            </div>

            <h2 className="winner-opinion">
              {
                gameWinner.text
              }
            </h2>

            {revealAuthors && (
              <p className="winner-author">
                {gameWinner.isFiller
                  ? "Game Generated"
                  : `Submitted by ${gameWinner.authorName}`}
              </p>
            )}
          </div>

          <div className="results-grid">
            <div className="results-panel">
              <h2>
                🔥 Hot Take Rankings
              </h2>

              <div className="ranking-list">
                {finalRankings.map(
                  (
                    opinion,
                    index
                  ) => (
                    <div
                      className="ranking-row"
                      key={
                        opinion.id
                      }
                    >
                      <div className="ranking-number">
                        #
                        {index +
                          1}
                      </div>

                      <div className="ranking-content">
                        <strong>
                          {
                            opinion.text
                          }
                        </strong>

                        {revealAuthors && (
                          <span className="ranking-author">
                            {opinion.isFiller
                              ? "Game Generated"
                              : `Submitted by ${opinion.authorName}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="results-panel">
              <h2>
                🏅 Player Leaderboard
              </h2>

              {finalPlayers.map(
                (
                  player,
                  index
                ) => (
                  <div
                    className="player-score-row"
                    key={
                      player.id
                    }
                  >
                    <span>
                      {index ===
                      0
                        ? "🥇"
                        : index ===
                          1
                        ? "🥈"
                        : index ===
                          2
                        ? "🥉"
                        : `#${
                            index +
                            1
                          }`}
                    </span>

                    <span className="score-name">
                      {
                        player.name
                      }
                    </span>

                    <strong className="score-points">
                      {
                        player.score
                      }{" "}
                      pts
                    </strong>
                  </div>
                )
              )}
            </div>
          </div>

          {isHost && (
            <button
              className="secondary-button reveal-button"
              onClick={
                toggleAuthors
              }
            >
              {revealAuthors
                ? "Hide Authors"
                : "Reveal Authors"}
            </button>
          )}
        </section>
      </main>
    );
  }

  if (
    gameState ===
      "voting" &&
    currentMatch
  ) {
    const roundName =
      getRoundName(
        currentMatch.roundNumber,
        currentMatch.totalOpinions
      );

    return (
      <main className="app-shell">
        <section className="battle-card">
          <div className="battle-header">
            <div>
              <span className="round-pill">
                {roundName}
              </span>

              {isHost && (
                <div className="votes-progress">
                  {
                    votingProgress.submitted
                  }{" "}
                  /{" "}
                  {
                    votingProgress.total
                  }{" "}
                  submitted
                </div>
              )}
            </div>

            <div
              className={`countdown ${
                secondsLeft <=
                3
                  ? "countdown-danger"
                  : ""
              }`}
            >
              {
                secondsLeft
              }
            </div>
          </div>

          <p className="battle-question">
            Which is the more unpopular opinion?
          </p>

          <div className="battle-options">
            <div
              className={`battle-option option-purple ${
                selectedVote ===
                currentMatch
                  .opinionA.id
                  ? "battle-option-selected"
                  : ""
              }`}
              onClick={() => {
                if (
                  !isHost &&
                  !roundSubmitted
                ) {
                  setSelectedVote(
                    currentMatch
                      .opinionA.id
                  );
                }
              }}
            >
              <div className="option-letter">
                A
              </div>

              <div className="battle-option-text">
                {
                  currentMatch
                    .opinionA.text
                }
              </div>

              {renderPlayerChips(
                currentMatch.opinionA
              )}
            </div>

            <div className="vs-badge">
              VS
            </div>

            <div
              className={`battle-option option-blue ${
                selectedVote ===
                currentMatch
                  .opinionB.id
                  ? "battle-option-selected"
                  : ""
              }`}
              onClick={() => {
                if (
                  !isHost &&
                  !roundSubmitted
                ) {
                  setSelectedVote(
                    currentMatch
                      .opinionB.id
                  );
                }
              }}
            >
              <div className="option-letter">
                B
              </div>

              <div className="battle-option-text">
                {
                  currentMatch
                    .opinionB.text
                }
              </div>

              {renderPlayerChips(
                currentMatch.opinionB
              )}
            </div>
          </div>

          {!isHost &&
            !roundSubmitted &&
            !matchResult && (
              <button
                className="submit-round-button"
                disabled={
                  !selectedVote
                }
                onClick={() =>
                  submitCurrentRound()
                }
              >
                {selectedVote
                  ? "Submit Choice"
                  : "Choose A or B"}
              </button>
            )}

          {!isHost &&
            roundSubmitted &&
            !matchResult && (
              <div className="submitted-banner">
                ✓ Submitted
              </div>
            )}

          {!isHost &&
            !roundSubmitted &&
            selectedVote &&
            secondsLeft <=
              3 && (
              <p className="auto-submit-message">
                Your current selection will automatically submit when time runs out.
              </p>
            )}

          {matchResult && (
            <div className="round-result-overlay">
              <span className="result-small">
                {
                  matchResult.votesA
                }{" "}
                –{" "}
                {
                  matchResult.votesB
                }
              </span>

              <span className="result-small">
                Advances
              </span>

              <strong>
                {
                  matchResult
                    .winner.text
                }
              </strong>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (
    gameState ===
    "preparing"
  ) {
    return (
      <main className="app-shell">
        <section className="game-card">
          <div className="loading-ring" />

          <h2>
            Building the bracket...
          </h2>
        </section>
      </main>
    );
  }

  if (
    hostRoomCode &&
    gameState ===
      "submitting"
  ) {
    return (
      <main className="app-shell">
        <section className="game-card">
          <p className="subtitle">
            Collecting Hot Takes
          </p>

          <h1>
            {hostRoomCode}
          </h1>

          <p className="submission-counter">
            {submittedCount} /{" "}
            {players.length}
          </p>

          <div className="player-list">
            {players.map(
              (player) => (
                <div
                  className={`player-pill ${
                    player.hasSubmitted
                      ? "player-submitted"
                      : ""
                  }`}
                  key={
                    player.id
                  }
                >
                  <span>
                    {
                      player.name
                    }
                  </span>

                  <span>
                    {player.hasSubmitted
                      ? "✓"
                      : "Waiting"}
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      </main>
    );
  }

  if (hostRoomCode) {
    return (
      <main className="app-shell">
        <section className="game-card">
          <p className="subtitle">
            Room Code
          </p>

          <h1>
            {hostRoomCode}
          </h1>

          <div className="qr-container">
            <QRCodeSVG
              value={joinUrl}
              size={210}
              includeMargin
            />
          </div>

          <p className="scan-text">
            Scan to join
          </p>

          <div className="player-list">
            {players.map(
              (player) => (
                <div
                  className="player-pill"
                  key={
                    player.id
                  }
                >
                  {
                    player.name
                  }
                </div>
              )
            )}
          </div>

          <button
            className="primary-button start-button"
            onClick={
              handleStartGame
            }
            disabled={
              players.length ===
              0
            }
          >
            Start Game
          </button>
        </section>
      </main>
    );
  }

  if (
    joinedRoomCode &&
    gameState ===
      "submitting"
  ) {
    if (
      hasSubmittedOpinions
    ) {
      return (
        <main className="app-shell">
          <section className="game-card">
            <div className="success-icon">
              ✓
            </div>

            <h2>
              Hot takes submitted!
            </h2>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <section className="game-card">
          <p className="subtitle">
            Submit Your Hot Takes
          </p>

          <h2 className="section-title">
            Give us at least 2
          </h2>

          <textarea
            className="opinion-input"
            placeholder="Hot take #1"
            value={
              opinionOne
            }
            maxLength={160}
            onChange={(event) =>
              setOpinionOne(
                event.target.value
              )
            }
          />

          <textarea
            className="opinion-input"
            placeholder="Hot take #2"
            value={
              opinionTwo
            }
            maxLength={160}
            onChange={(event) =>
              setOpinionTwo(
                event.target.value
              )
            }
          />

          {extraOpinions.map(
            (
              opinion,
              index
            ) => (
              <textarea
                className="opinion-input"
                key={index}
                placeholder={`Hot take #${
                  index + 3
                }`}
                value={
                  opinion
                }
                onChange={(event) =>
                  updateExtraOpinion(
                    index,
                    event.target.value
                  )
                }
              />
            )
          )}

          <button
            className="add-opinion-button"
            onClick={
              addExtraOpinion
            }
          >
            + Add another
          </button>

          <button
            className="primary-button"
            onClick={
              handleSubmitOpinions
            }
          >
            Submit Hot Takes
          </button>
        </section>
      </main>
    );
  }

  if (joinedRoomCode) {
    return (
      <main className="app-shell">
        <section className="game-card">
          <p className="subtitle">
            Joined Room
          </p>

          <h1>
            {joinedRoomCode}
          </h1>

          <p>
            Welcome,{" "}
            <strong>
              {playerName}
            </strong>
          </p>

          <p className="subtitle">
            Waiting for host...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="game-card">
        <h1>
          Hot Take
        </h1>

        <p className="subtitle">
          Unpopular Opinion Battle
        </p>

        <button
          className="primary-button"
          onClick={
            handleHostGame
          }
        >
          Host Game
        </button>

        <div className="divider">
          or
        </div>

        <input
          type="text"
          placeholder="Your name"
          value={
            playerName
          }
          onChange={(event) =>
            setPlayerName(
              event.target.value
            )
          }
        />

        <div className="input-spacer" />

        <input
          type="text"
          maxLength={4}
          placeholder="Room code"
          value={
            roomCode
          }
          onChange={(event) =>
            setRoomCode(
              event.target.value.toUpperCase()
            )
          }
        />

        <button
          className="secondary-button"
          onClick={
            handleJoinGame
          }
        >
          Join Game
        </button>

        {errorMessage && (
          <p className="error-message">
            {errorMessage}
          </p>
        )}
      </section>
    </main>
  );
}

export default App;