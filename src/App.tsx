import {
  useEffect,
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

  endsAt: number;
};

type GuessResult = {
  submitted: boolean;
  correct: boolean;
  points: number;
};

function App() {
  const [
    roomCode,
    setRoomCode,
  ] = useState("");

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

  const [
    players,
    setPlayers,
  ] = useState<Player[]>(
    []
  );

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
  ] = useState<
    string[]
  >([]);

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
    secondsLeft,
    setSecondsLeft,
  ] = useState(10);

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
  ] = useState<
    Opinion[]
  >([]);

  const [
    finalPlayers,
    setFinalPlayers,
  ] = useState<
    Player[]
  >([]);

  const [
    revealAuthors,
    setRevealAuthors,
  ] = useState(false);

  const [
    guessSelections,
    setGuessSelections,
  ] = useState<
    Record<string, string>
  >({});

  const [
    guessResults,
    setGuessResults,
  ] = useState<
    Record<
      string,
      GuessResult
    >
  >({});

  useEffect(() => {
    const pathParts =
      window.location.pathname.split(
        "/"
      );

    if (
      pathParts[1] ===
        "join" &&
      pathParts[2]
    ) {
      setRoomCode(
        pathParts[2].toUpperCase()
      );
    }
  }, []);

  useEffect(() => {
    const handleRoomUpdated = (
      data: {
        roomCode: string;
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

        setMatchResult(
          null
        );

        const updateTimer =
          () => {
            const remaining =
              data.endsAt -
              Date.now();

            setSecondsLeft(
              Math.max(
                0,
                Math.ceil(
                  remaining /
                    1000
                )
              )
            );
          };

        updateTimer();

        const interval =
          window.setInterval(
            updateTimer,
            200
          );

        window.setTimeout(
          () => {
            window.clearInterval(
              interval
            );
          },
          11000
        );
      };

    const handleMatchResult =
      (data: {
        votesA: number;
        votesB: number;
        winner: Opinion;
      }) => {
        setMatchResult({
          votesA:
            data.votesA,

          votesB:
            data.votesB,

          winner:
            data.winner,
        });
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
      setErrorMessage("");

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
                "Unable to join room."
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
                "Unable to start game."
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
      setErrorMessage("");

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
                "Unable to submit opinions."
            );

            return;
          }

          setHasSubmittedOpinions(
            true
          );
        }
      );
    };

  const handleVote = (
    opinionId: string
  ) => {
    if (selectedVote) {
      return;
    }

    setSelectedVote(
      opinionId
    );

    socket.emit(
      "submit-vote",
      {
        roomCode:
          joinedRoomCode,

        opinionId,
      }
    );
  };

  const handleGuessAuthor =
    (
      opinion: Opinion
    ) => {
      const guessedPlayerId =
        guessSelections[
          opinion.id
        ];

      if (
        !guessedPlayerId
      ) {
        return;
      }

      socket.emit(
        "guess-author",
        {
          roomCode:
            joinedRoomCode,

          opinionId:
            opinion.id,

          guessedPlayerId,
        },

        (response: {
          success: boolean;
          correct?: boolean;
          points?: number;
          message?: string;
        }) => {
          if (
            !response.success
          ) {
            alert(
              response.message ??
                "Unable to guess."
            );

            return;
          }

          setGuessResults(
            (current) => ({
              ...current,

              [opinion.id]: {
                submitted:
                  true,

                correct:
                  response.correct ??
                  false,

                points:
                  response.points ??
                  0,
              },
            })
          );
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

  const renderGuessBox = (
    opinion: Opinion
  ) => {
    if (isHost) {
      return null;
    }

    if (
      opinion.isFiller
    ) {
      return (
        <div className="guess-box filler-label">
          Game generated
        </div>
      );
    }

    const result =
      guessResults[
        opinion.id
      ];

    if (result?.submitted) {
      return (
        <div
          className={`guess-result ${
            result.correct
              ? "guess-correct"
              : "guess-wrong"
          }`}
        >
          {result.correct
            ? `Correct! +${result.points}`
            : "Wrong guess"}
        </div>
      );
    }

    return (
      <div className="guess-box">
        <span className="guess-title">
          Who wrote this?
        </span>

        <select
          className="guess-select"
          value={
            guessSelections[
              opinion.id
            ] ?? ""
          }
          onChange={(
            event
          ) =>
            setGuessSelections(
              (current) => ({
                ...current,

                [opinion.id]:
                  event.target
                    .value,
              })
            )
          }
        >
          <option value="">
            Choose player
          </option>

          {players
            .filter(
              (player) =>
                player.id !==
                socket.id
            )
            .map(
              (player) => (
                <option
                  key={
                    player.id
                  }
                  value={
                    player.id
                  }
                >
                  {
                    player.name
                  }
                </option>
              )
            )}
        </select>

        <button
          className="guess-button"
          onClick={() =>
            handleGuessAuthor(
              opinion
            )
          }
        >
          Lock Guess
        </button>
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
              Most Unpopular
              Opinion
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
                🔥 Hot Take
                Rankings
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

                        <span>
                          {
                            opinion.wins
                          }{" "}
                          matchup
                          {opinion.wins ===
                          1
                            ? ""
                            : "s"}{" "}
                          won
                        </span>

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
                🏅 Player
                Leaderboard
              </h2>

              <div className="ranking-list">
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
                      <span className="player-position">
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
    return (
      <main className="app-shell">
        <section className="game-card vote-card">
          <p className="subtitle">
            Round{" "}
            {
              currentMatch.roundNumber
            }
          </p>

          <div className="timer">
            {secondsLeft}
          </div>

          <p className="vote-instruction">
            Which is the more
            unpopular opinion?
          </p>

          <button
            className={`opinion-choice opinion-a ${
              selectedVote ===
              currentMatch
                .opinionA.id
                ? "selected-choice"
                : ""
            }`}
            onClick={() =>
              !isHost &&
              handleVote(
                currentMatch
                  .opinionA.id
              )
            }
            disabled={
              isHost ||
              !!selectedVote
            }
          >
            {
              currentMatch
                .opinionA.text
            }
          </button>

          {renderGuessBox(
            currentMatch.opinionA
          )}

          <div className="versus">
            VS
          </div>

          <button
            className={`opinion-choice opinion-b ${
              selectedVote ===
              currentMatch
                .opinionB.id
                ? "selected-choice"
                : ""
            }`}
            onClick={() =>
              !isHost &&
              handleVote(
                currentMatch
                  .opinionB.id
              )
            }
            disabled={
              isHost ||
              !!selectedVote
            }
          >
            {
              currentMatch
                .opinionB.text
            }
          </button>

          {renderGuessBox(
            currentMatch.opinionB
          )}

          {!isHost &&
            selectedVote &&
            !matchResult && (
              <p className="locked-message">
                ✓ Vote locked in
              </p>
            )}

          {isHost &&
            !matchResult && (
              <p className="host-display-message">
                Players are
                voting...
              </p>
            )}

          {matchResult && (
            <div className="match-result">
              <p className="result-score">
                {
                  matchResult.votesA
                }{" "}
                -{" "}
                {
                  matchResult.votesB
                }
              </p>

              <span>
                Advances to the
                next round
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
            Building the
            bracket...
          </h2>

          <p className="subtitle">
            Get ready
          </p>
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
            Collecting Hot
            Takes
          </p>

          <h1>
            {
              hostRoomCode
            }
          </h1>

          <p className="submission-counter">
            {submittedCount} /{" "}
            {
              players.length
            }
          </p>

          <p className="subtitle">
            Players submitted
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
            {
              hostRoomCode
            }
          </h1>

          <div className="qr-container">
            <QRCodeSVG
              value={
                joinUrl
              }
              size={210}
              bgColor="#ffffff"
              fgColor="#111111"
              level="M"
              includeMargin
            />
          </div>

          <p className="scan-text">
            Scan to join
          </p>

          <p className="subtitle">
            {
              players.length
            }{" "}
            {players.length ===
            1
              ? "player"
              : "players"}{" "}
            joined
          </p>

          <div className="player-list">
            {players.length ===
            0 ? (
              <p className="empty-message">
                Waiting for
                players...
              </p>
            ) : (
              players.map(
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

          {errorMessage && (
            <p className="error-message">
              {
                errorMessage
              }
            </p>
          )}
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
              Hot takes
              submitted!
            </h2>

            <p className="subtitle">
              Waiting for
              everyone else...
            </p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <section className="game-card">
          <p className="subtitle">
            Submit Your Hot
            Takes
          </p>

          <h2 className="section-title">
            Give us at least
            2 unpopular
            opinions
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
                key={
                  index
                }
                placeholder={`Hot take #${
                  index + 3
                }`}
                value={
                  opinion
                }
                maxLength={
                  160
                }
                onChange={(
                  event
                ) =>
                  updateExtraOpinion(
                    index,
                    event
                      .target
                      .value
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

          {errorMessage && (
            <p className="error-message">
              {
                errorMessage
              }
            </p>
          )}
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
            {
              joinedRoomCode
            }
          </h1>

          <p className="welcome-text">
            Welcome,{" "}
            <strong>
              {
                playerName
              }
            </strong>
          </p>

          <p className="subtitle">
            Waiting for the
            host to start...
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
          Unpopular Opinion
          Battle
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
            {
              errorMessage
            }
          </p>
        )}
      </section>
    </main>
  );
}

export default App;