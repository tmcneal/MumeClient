# MumeClient

## Getting Started

### 1. Install Bun (if you don't have it)

See: https://bun.sh/docs/installation

```
curl -fsSL https://bun.sh/install | bash
```

### 2. Install dependencies

```
bun install
```

### 3. Configure MUD Server Connection

Edit `index.ts` and set the correct `MUD_HOST` and `MUD_PORT` values for your MUD server:

```
const MUD_HOST = "localhost"; // Set your MUD server host
const MUD_PORT = 4000;        // Set your MUD server port
```

### 4. Start the server

```
bun index.ts
```

The server will start on [http://localhost:8080](http://localhost:8080).

### 5. Use the Web Client

Open your browser and go to:

```
http://localhost:8080
```

Type commands in the input box and see responses from the MUD server (parsed from XML to JSON).

