# Domino Party Game

A Dominican-style dominoes party game built with [`@couch-kit`](https://github.com/faluciano/tv-part-library). An Android TV acts as the game board and server, while phones connect as controllers via QR code.

## How It Works

- **TV (Host)**: Runs on Android TV, displays the domino board, scores, and manages the game
- **Smartphones (Controllers)**: Players connect via QR code to view their hand and play tiles
- **Real-time Sync**: All devices stay synchronized via WebSocket over local network
- **Bots**: Empty seats are auto-filled with simple bots so you can play with 1-3 humans

## Game Rules (Dominican Dominoes)

- **Players**: 4 players in 2 teams (Team A: seats 0 & 2, Team B: seats 1 & 3 -- partners sit across)
- **Tiles**: Standard double-six set (28 tiles: [0|0] through [6|6])
- **Deal**: All 28 tiles dealt, 7 per player
- **First round**: Player with the double-six (la mula) goes first
- **Subsequent rounds**: Winner of the previous round leads
- **Turns**: Clockwise. Play a tile matching either open end of the chain, or pass if unable
- **Domino**: When a player empties their hand, their team scores the total pips remaining in the opponents' hands
- **Tranque (Blocked)**: When no player can play, the team with fewer remaining pips wins and scores the difference
- **Game winner**: First team to reach 200 points

## Project Structure

```
domino-party-game/
├── packages/
│   ├── shared/          # Game logic, types, reducer (runs on both host and client)
│   ├── host/            # Android TV React Native app (Expo)
│   └── client/          # Phone web controller (Vite + React)
├── package.json         # Root workspace configuration
└── README.md
```

## Prerequisites

- **Bun** (v1.3.5 or later) - [Install Bun](https://bun.sh/)
- **JDK 17** - Required by Gradle for the Android build
  ```bash
  brew install openjdk@17
  sudo ln -sfn $(brew --prefix openjdk@17)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
  ```
- **Android SDK** with `ANDROID_HOME` set
- **ADB** connected device or Android TV emulator

### Environment Variables

Add the following to your shell config (`~/.config/fish/config.fish` for Fish, or `~/.zshrc` for Zsh):

```bash
# Fish
set -gx JAVA_HOME (brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home
set -gx ANDROID_HOME ~/Library/Android/sdk

# Zsh / Bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=~/Library/Android/sdk
```

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Generate the Native Android Project (First Time Only)

```bash
cd packages/host
bun run prebuild
```

> **Important:** `expo prebuild` clears and regenerates the `android/` directory. Always run `prebuild` **before** bundling the client.

### 3. Bundle the Client and Build for Android

```bash
bun run bundle:client
cd packages/host && npx expo run:android
```

For a complete first-time build from a fresh clone:

```bash
bun install
cd packages/host && bun run prebuild && cd ../..
bun run bundle:client
cd packages/host && npx expo run:android
```

### 4. Connect and Play

1. The TV will display a QR code
2. Scan with your phone to open the controller
3. Choose your team in the lobby
4. Tap "Start Game" -- empty seats are filled with bots
5. Play dominoes! Tap a tile to play it, or pass when you can't

## Player Configurations

| Humans | Bots | Description                       |
| ------ | ---- | --------------------------------- |
| 4      | 0    | Full human game                   |
| 3      | 1    | 1 bot fills the empty seat        |
| 2      | 2    | Humans on same or different teams |
| 1      | 3    | Solo practice with 3 bots         |

Players can choose their team in the lobby. When the game starts, any empty seats are automatically filled with bots.

## Bot Behavior

Bots use a simple strategy: on their turn, they play the first valid tile in their hand. If no tile can be played, they pass. Bot turns execute automatically on the host with a short delay (~600ms).

## Development

### Dev Mode (Hot Reloading)

For iterating on the client without rebuilding the Android app each time:

1. Start the Vite dev server:
   ```bash
   bun run dev:client
   ```
2. Update `packages/host/App.tsx` to enable dev mode:
   ```tsx
   <GameHostProvider config={{
     reducer: gameReducer,
     initialState,
     devMode: true,
     devServerUrl: "http://<YOUR_LAPTOP_IP>:5173",
   }}>
   ```
3. Run the host on the device -- phones will be pointed at your laptop's Vite server.

### Available Scripts

**Root Level:**

```bash
bun install              # Install all dependencies
bun run dev:client       # Start client Vite dev server
bun run build:client     # Build client for production
bun run bundle:client    # Build + copy client into host Android assets
bun run build:android    # bundle:client + expo run:android
```

**Client (Web Controller):**

```bash
cd packages/client
bun run dev             # Start development server
bun run build           # Build for production
bun run preview         # Preview production build
```

**Host (Android TV - Expo):**

```bash
cd packages/host
bun run prebuild        # Generate native project files (clears android/ directory!)
bun run android         # Run on Android device/emulator
bun run start           # Start Expo development server
```

### Architecture

The game uses a Redux-like shared reducer pattern:

**State** includes: teams, seats, hands, board, board ends, scores, turn order, round tracking, and bots.

**Actions:**

| Action          | Description                                        |
| --------------- | -------------------------------------------------- |
| `PLAYER_JOINED` | Auto-dispatched when a phone connects              |
| `PLAYER_LEFT`   | Auto-dispatched when a phone disconnects           |
| `CHOOSE_TEAM`   | Player switches team in the lobby                  |
| `START_GAME`    | Start the game (fills bots, deals tiles)           |
| `PLAY_TILE`     | Play a tile on the left or right end of the board  |
| `PASS`          | Pass turn (only valid when no tiles can be played) |
| `NEW_ROUND`     | Start the next round after a round ends            |
| `RESET_GAME`    | Return to lobby                                    |

The reducer runs on both the TV (host) and web controller (client), keeping state synchronized. The host is authoritative -- it runs bot turns and broadcasts state updates to all clients.

## Troubleshooting

### Client page is blank after scanning QR code

The web controller wasn't bundled. This happens if `expo prebuild` was run after `bundle:client`. Fix:

```bash
bun run bundle:client
```

Then rebuild the Android app.

### WebSocket connection fails

Ensure both devices are on the same WiFi network.

### Metro bundler port conflict

```bash
cd packages/host
bun run start --reset-cache
```

## License

MIT

## Current Status

- @couch-kit/host: ^0.3.0
- @couch-kit/client: ^0.3.0
- @couch-kit/core: ^0.2.0
- Expo SDK: 54
- React Native: 0.81.5
