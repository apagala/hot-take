import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const server = createServer(app);
const io = new Server(server);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = new Map();

const fillerOpinions = [
  "Breakfast is overrated.",
  "Summer is the worst season.",
  "Coffee tastes bad.",
  "Socks should be worn in bed.",
  "Movies are better without popcorn.",
  "Pineapple belongs on pizza.",
  "Going out is overrated.",
  "The middle seat on a plane is not that bad.",
  "Chocolate is overrated.",
  "Cats are better than dogs.",
  "Cold showers are better than hot showers.",
  "Fries are better without sauce.",
  "Brunch is just overpriced breakfast.",
  "Concerts are better seated.",
  "Rainy weather is better than sunny weather.",
  "Sleeping with the fan on is always better.",
];

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function shuffleArray(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function nextPowerOfTwo(number) {
  let power = 1;

  while (power < number) {
    power *= 2;
  }

  return power;
}

function publicPlayers(room) {
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    hasSubmitted: player.hasSubmitted,
    score: player.score,
    connected: Boolean(player.socketId),
  }));
}

function getSubmittedCount(room) {
  return room.players.filter(
    (player) => player.hasSubmitted
  ).length;
}

function emitRoomUpdate(roomCode) {
  const room = rooms.get(roomCode);

  if (!room) return;

  io.to(roomCode).emit("room-updated", {
    roomCode,
    players: publicPlayers(room),
    gameState: room.gameState,
    submittedCount: getSubmittedCount(room),
  });
}

function emitScores(room) {
  const leaderboard = [...publicPlayers(room)].sort(
    (a, b) => b.score - a.score
  );

  io.to(room.roomCode).emit("scores-updated", {
    players: leaderboard,
  });
}

function emitVotingProgress(room) {
  if (!room.currentMatch) return;

  io.to(room.roomCode).emit("voting-progress", {
    submitted:
      room.currentMatch.submittedPlayers.size,
    total: room.players.length,
  });
}

function getGuessPoints(position) {
  if (position === 1) return 500;
  if (position === 2) return 400;
  if (position === 3) return 300;
  if (position === 4) return 200;

  return 100;
}

function processAuthorGuess(
  room,
  player,
  opinionId,
  guessedPlayerId
) {
  if (!guessedPlayerId) {
    return null;
  }

  const opinion =
    room.tournamentOpinions.find(
      (item) => item.id === opinionId
    );

  if (!opinion || opinion.isFiller) {
    return null;
  }

  if (opinion.authorId === player.id) {
    return {
      success: false,
      opinionId,
      message: "You can't guess yourself.",
    };
  }

  room.authorGuesses[opinionId] ??= {};

  if (
    room.authorGuesses[opinionId][player.id]
  ) {
    return null;
  }

  const guessedPlayer =
    room.players.find(
      (item) => item.id === guessedPlayerId
    );

  if (!guessedPlayer) {
    return null;
  }

  const correct =
    guessedPlayerId === opinion.authorId;

  let points = 0;

  if (correct) {
    room.correctGuessCounts[opinionId] ??= 0;

    room.correctGuessCounts[opinionId] += 1;

    points = getGuessPoints(
      room.correctGuessCounts[opinionId]
    );

    player.score += points;
  }

  room.authorGuesses[opinionId][player.id] = {
    guessedPlayerId,
    correct,
    points,
  };

  return {
    success: true,
    opinionId,
    correct,
    points,
  };
}

function createTournament(room) {
  let opinions = [...room.opinions];

  const requiredCount =
    nextPowerOfTwo(opinions.length);

  const fillerNeeded =
    requiredCount - opinions.length;

  const shuffledFillers =
    shuffleArray(fillerOpinions);

  for (let i = 0; i < fillerNeeded; i++) {
    opinions.push({
      id: `filler-${Date.now()}-${i}`,
      text:
        shuffledFillers[
          i % shuffledFillers.length
        ],
      authorId: null,
      authorName: "Game Generated",
      isFiller: true,
      wins: 0,
      totalVotes: 0,
    });
  }

  opinions = shuffleArray(opinions);

  room.tournamentOpinions = opinions;
  room.totalTournamentOpinions =
    opinions.length;

  room.currentRound = opinions;
  room.nextRound = [];
  room.currentMatchIndex = 0;
  room.roundNumber = 1;

  startCurrentMatch(room);
}

function startCurrentMatch(room) {
  if (
    room.currentMatchIndex >=
    room.currentRound.length
  ) {
    if (room.nextRound.length === 1) {
      finishTournament(
        room,
        room.nextRound[0]
      );

      return;
    }

    room.currentRound = room.nextRound;
    room.nextRound = [];
    room.currentMatchIndex = 0;
    room.roundNumber += 1;

    startCurrentMatch(room);
    return;
  }

  const opinionA =
    room.currentRound[
      room.currentMatchIndex
    ];

  const opinionB =
    room.currentRound[
      room.currentMatchIndex + 1
    ];

  room.matchFinishing = false;

  room.currentMatch = {
    opinionA,
    opinionB,
    votes: {},
    submittedPlayers: new Set(),
    endsAt: Date.now() + 10000,
  };

  room.gameState = "voting";

  io.to(room.roomCode).emit(
    "match-started",
    {
      opinionA,
      opinionB,
      roundNumber: room.roundNumber,
      matchIndex:
        room.currentMatchIndex / 2,
      totalOpinions:
        room.totalTournamentOpinions,
      endsAt:
        room.currentMatch.endsAt,
    }
  );

  emitVotingProgress(room);

  room.matchTimer =
    setTimeout(() => {
      finishCurrentMatch(room);
    }, 10000);
}

function finishCurrentMatch(room) {
  if (
    !room.currentMatch ||
    room.matchFinishing
  ) {
    return;
  }

  room.matchFinishing = true;

  clearTimeout(room.matchTimer);

  const {
    opinionA,
    opinionB,
    votes,
  } = room.currentMatch;

  let votesA = 0;
  let votesB = 0;

  for (const vote of Object.values(votes)) {
    if (vote === opinionA.id) {
      votesA += 1;
    }

    if (vote === opinionB.id) {
      votesB += 1;
    }
  }

  opinionA.totalVotes += votesA;
  opinionB.totalVotes += votesB;

  let winner;

  if (votesA > votesB) {
    winner = opinionA;
  } else if (votesB > votesA) {
    winner = opinionB;
  } else {
    winner =
      Math.random() < 0.5
        ? opinionA
        : opinionB;
  }

  winner.wins += 1;

  room.nextRound.push(winner);

  io.to(room.roomCode).emit(
    "match-result",
    {
      opinionA,
      opinionB,
      votesA,
      votesB,
      winner,
    }
  );

  room.currentMatchIndex += 2;

  setTimeout(() => {
    startCurrentMatch(room);
  }, 2500);
}

function finishTournament(
  room,
  winner
) {
  room.gameState = "finished";
  room.winner = winner;

  const rankings = [
    ...room.tournamentOpinions,
  ].sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    return (
      b.totalVotes -
      a.totalVotes
    );
  });

  const players = [
    ...publicPlayers(room),
  ].sort(
    (a, b) => b.score - a.score
  );

  room.finalRankings = rankings;

  io.to(room.roomCode).emit(
    "game-finished",
    {
      winner,
      rankings,
      players,
      revealAuthors:
        room.revealAuthors,
    }
  );
}

function maybeStartTournament(room) {
  const allSubmitted =
    room.players.length > 0 &&
    room.players.every(
      (player) =>
        player.hasSubmitted
    );

  if (!allSubmitted) {
    return;
  }

  room.gameState = "preparing";

  io.to(room.roomCode).emit(
    "game-state-changed",
    {
      gameState: "preparing",
    }
  );

  setTimeout(() => {
    createTournament(room);
  }, 1500);
}

function buildSessionSnapshot(
  room,
  clientId,
  role
) {
  const player =
    room.players.find(
      (item) =>
        item.id === clientId
    );

  const snapshot = {
    success: true,
    role,
    roomCode: room.roomCode,
    players: publicPlayers(room),
    gameState: room.gameState,
    submittedCount:
      getSubmittedCount(room),
    revealAuthors:
      room.revealAuthors,
  };

  if (role === "player") {
    snapshot.playerName =
      player?.name ?? "";

    snapshot.hasSubmittedOpinions =
      player?.hasSubmitted ?? false;
  }

  if (
    room.gameState === "voting" &&
    room.currentMatch
  ) {
    snapshot.currentMatch = {
      opinionA:
        room.currentMatch.opinionA,

      opinionB:
        room.currentMatch.opinionB,

      roundNumber:
        room.roundNumber,

      matchIndex:
        room.currentMatchIndex /
        2,

      totalOpinions:
        room.totalTournamentOpinions,

      endsAt:
        room.currentMatch.endsAt,
    };

    snapshot.votingProgress = {
      submitted:
        room.currentMatch
          .submittedPlayers.size,

      total:
        room.players.length,
    };

    snapshot.roundSubmitted =
      role === "player"
        ? room.currentMatch
            .submittedPlayers.has(
              clientId
            )
        : false;
  }

  if (
    room.gameState === "finished"
  ) {
    snapshot.winner =
      room.winner;

    snapshot.rankings =
      room.finalRankings;

    snapshot.finalPlayers = [
      ...publicPlayers(room),
    ].sort(
      (a, b) =>
        b.score - a.score
    );
  }

  return snapshot;
}

io.on("connection", (socket) => {
  console.log(
    "Connected:",
    socket.id
  );

  socket.on(
    "create-room",
    (
      { clientId },
      callback
    ) => {
      let roomCode;

      do {
        roomCode =
          generateRoomCode();
      } while (
        rooms.has(roomCode)
      );

      const room = {
        roomCode,

        hostClientId:
          clientId,

        hostSocketId:
          socket.id,

        hostDisconnectTimer:
          null,

        gameState:
          "lobby",

        players: [],
        opinions: [],

        tournamentOpinions: [],
        totalTournamentOpinions:
          0,

        currentRound: [],
        nextRound: [],

        currentMatchIndex: 0,
        currentMatch: null,

        roundNumber: 0,

        matchTimer: null,
        matchFinishing: false,

        winner: null,
        finalRankings: [],

        authorGuesses: {},
        correctGuessCounts: {},

        revealAuthors: false,
      };

      rooms.set(
        roomCode,
        room
      );

      socket.join(roomCode);

      callback({
        success: true,
        roomCode,
      });
    }
  );

  socket.on(
    "join-room",
    (
      {
        roomCode,
        playerName,
        clientId,
      },
      callback
    ) => {
      const code =
        roomCode.toUpperCase();

      const room =
        rooms.get(code);

      if (!room) {
        callback({
          success: false,
          message:
            "Room not found",
        });

        return;
      }

      if (
        room.gameState !==
        "lobby"
      ) {
        callback({
          success: false,
          message:
            "This game has already started",
        });

        return;
      }

      const cleanName =
        playerName.trim();

      const nameExists =
        room.players.some(
          (player) =>
            player.name
              .toLowerCase() ===
            cleanName.toLowerCase()
        );

      if (nameExists) {
        callback({
          success: false,
          message:
            "Someone is already using that name",
        });

        return;
      }

      const player = {
        id: clientId,
        socketId: socket.id,
        name: cleanName,
        hasSubmitted: false,
        score: 0,
        disconnectTimer: null,
      };

      room.players.push(player);

      socket.join(code);

      emitRoomUpdate(code);

      callback({
        success: true,
        roomCode: code,
        players:
          publicPlayers(room),
      });
    }
  );

  socket.on(
    "resume-session",
    (
      {
        roomCode,
        clientId,
        role,
      },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (!room) {
        callback({
          success: false,
          message:
            "Room no longer exists",
        });

        return;
      }

      if (role === "host") {
        if (
          room.hostClientId !==
          clientId
        ) {
          callback({
            success: false,
          });

          return;
        }

        if (
          room.hostDisconnectTimer
        ) {
          clearTimeout(
            room.hostDisconnectTimer
          );

          room.hostDisconnectTimer =
            null;
        }

        room.hostSocketId =
          socket.id;

        socket.join(roomCode);

        callback(
          buildSessionSnapshot(
            room,
            clientId,
            "host"
          )
        );

        emitRoomUpdate(
          roomCode
        );

        return;
      }

      const player =
        room.players.find(
          (item) =>
            item.id ===
            clientId
        );

      if (!player) {
        callback({
          success: false,
          message:
            "Player session not found",
        });

        return;
      }

      if (
        player.disconnectTimer
      ) {
        clearTimeout(
          player.disconnectTimer
        );

        player.disconnectTimer =
          null;
      }

      player.socketId =
        socket.id;

      socket.join(roomCode);

      callback(
        buildSessionSnapshot(
          room,
          clientId,
          "player"
        )
      );

      emitRoomUpdate(
        roomCode
      );
    }
  );

  socket.on(
    "start-game",
    (
      { roomCode },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (!room) {
        return;
      }

      if (
        room.hostSocketId !==
        socket.id
      ) {
        callback?.({
          success: false,
          message:
            "Only host can start",
        });

        return;
      }

      room.gameState =
        "submitting";

      io.to(roomCode).emit(
        "game-state-changed",
        {
          gameState:
            "submitting",
        }
      );

      emitRoomUpdate(roomCode);

      callback?.({
        success: true,
      });
    }
  );

  socket.on(
    "submit-opinions",
    (
      {
        roomCode,
        clientId,
        opinions,
      },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (!room) return;

      const player =
        room.players.find(
          (item) =>
            item.id ===
            clientId
        );

      if (!player) {
        return;
      }

      const cleanedOpinions =
        opinions
          .map((opinion) =>
            opinion.trim()
          )
          .filter(Boolean);

      if (
        cleanedOpinions.length <
        2
      ) {
        callback?.({
          success: false,
          message:
            "Submit at least 2 opinions",
        });

        return;
      }

      if (
        player.hasSubmitted
      ) {
        callback?.({
          success: false,
          message:
            "Already submitted",
        });

        return;
      }

      for (
        const opinion of
        cleanedOpinions
      ) {
        room.opinions.push({
          id: `${clientId}-${Date.now()}-${Math.random()}`,
          text: opinion,
          authorId:
            clientId,
          authorName:
            player.name,
          isFiller: false,
          wins: 0,
          totalVotes: 0,
        });
      }

      player.hasSubmitted =
        true;

      emitRoomUpdate(roomCode);

      callback?.({
        success: true,
      });

      maybeStartTournament(
        room
      );
    }
  );

  socket.on(
    "submit-round",
    (
      {
        roomCode,
        clientId,
        opinionId,
        guesses,
      },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (
        !room ||
        !room.currentMatch ||
        room.matchFinishing
      ) {
        callback?.({
          success: false,
          message:
            "Voting closed",
        });

        return;
      }

      const player =
        room.players.find(
          (item) =>
            item.id ===
            clientId
        );

      if (!player) {
        return;
      }

      if (
        room.currentMatch
          .submittedPlayers.has(
            clientId
          )
      ) {
        callback?.({
          success: false,
          message:
            "Already submitted",
        });

        return;
      }

      const validIds = [
        room.currentMatch
          .opinionA.id,

        room.currentMatch
          .opinionB.id,
      ];

      if (
        !validIds.includes(
          opinionId
        )
      ) {
        callback?.({
          success: false,
          message:
            "Choose an opinion",
        });

        return;
      }

      room.currentMatch.votes[
        clientId
      ] = opinionId;

      room.currentMatch
        .submittedPlayers.add(
          clientId
        );

      const guessResults = [];

      for (
        const [
          guessedOpinionId,
          guessedPlayerId,
        ] of Object.entries(
          guesses ?? {}
        )
      ) {
        if (
          !validIds.includes(
            guessedOpinionId
          )
        ) {
          continue;
        }

        const result =
          processAuthorGuess(
            room,
            player,
            guessedOpinionId,
            guessedPlayerId
          );

        if (result) {
          guessResults.push(
            result
          );
        }
      }

      emitScores(room);
      emitVotingProgress(room);

      callback?.({
        success: true,
        guessResults,
      });

      if (
        room.currentMatch
          .submittedPlayers
          .size >=
        room.players.length
      ) {
        finishCurrentMatch(
          room
        );
      }
    }
  );

  socket.on(
    "toggle-reveal-authors",
    (
      { roomCode },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (!room) return;

      if (
        room.hostSocketId !==
        socket.id
      ) {
        return;
      }

      room.revealAuthors =
        !room.revealAuthors;

      io.to(roomCode).emit(
        "authors-revealed",
        {
          revealAuthors:
            room.revealAuthors,
        }
      );

      callback?.({
        success: true,
      });
    }
  );

  socket.on(
    "disconnect",
    () => {
      for (const [
        roomCode,
        room,
      ] of rooms.entries()) {
        if (
          room.hostSocketId ===
          socket.id
        ) {
          room.hostSocketId =
            null;

          room.hostDisconnectTimer =
            setTimeout(() => {
              io.to(roomCode).emit(
                "room-closed"
              );

              rooms.delete(
                roomCode
              );
            }, 30000);

          continue;
        }

        const player =
          room.players.find(
            (item) =>
              item.socketId ===
              socket.id
          );

        if (!player) {
          continue;
        }

        player.socketId =
          null;

        player.disconnectTimer =
          setTimeout(() => {
            player.disconnectTimer =
              null;

            emitRoomUpdate(
              roomCode
            );
          }, 30000);

        emitRoomUpdate(
          roomCode
        );
      }
    }
  );
});

app.use(
  express.static(
    path.join(
      __dirname,
      "dist"
    )
  )
);

app.get(
  "/*splat",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "dist",
        "index.html"
      )
    );
  }
);

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);