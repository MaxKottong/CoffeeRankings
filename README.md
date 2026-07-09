# ☕ Coffee Rankings

A website for ranking coffee places. It has a home page listing every place with
its rating (out of 10), a navbar to reach a submission form, and it saves
submissions to MongoDB. Built with Express, EJS, Mongoose, and Bootstrap.

## Features

- **Home page** — hero banner plus a ranked, card-based list of coffee places
  (highest rated first).
- **Navbar** — links to the Home page and the Submit form on every page.
- **Submit form** — enter a place name, optional location, a rating from 0–10,
  and optional notes. Server-side validation guards the input.
- **MongoDB storage** — submissions are saved via Mongoose.
- **Bootstrap 5** styling with a custom coffee theme.

## Project structure

```
server.js            # App entry point, DB connection, middleware
routes/places.js     # Home, submit, and delete routes
models/Place.js      # Mongoose schema/model
views/               # EJS templates (index, submit, error, partials)
public/css/style.css # Custom styles
```

## Prerequisites

- Node.js (v16+)
- A MongoDB database — either a local server or a free
  [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a `.env` file (copy from `.env.example`) and set your connection
   string:

   ```
   MONGODB_URI=mongodb://127.0.0.1:27017/coffee_ratings
   PORT=3000
   ```

3. Start the app:

   ```powershell
   npm start
   ```

   Or with auto-reload during development:

   ```powershell
   npm run dev
   ```

4. Open http://localhost:3000 in your browser.

## Deploying so anyone can view it

GitHub Pages only serves static sites, so it can't run this Express server or
connect to MongoDB. Instead, deploy the server to a host that runs Node.js
(e.g. [Render](https://render.com)) and use a cloud database
([MongoDB Atlas](https://www.mongodb.com/cloud/atlas), free tier).

1. Create a MongoDB Atlas cluster and copy its connection string.
2. Push this repo to GitHub.
3. On Render, create a new **Web Service** from your GitHub repo (a
   `render.yaml` blueprint is included, or configure manually):
   - Build command: `npm install`
   - Start command: `npm start`
   - Add an environment variable `MONGODB_URI` set to your Atlas connection
     string.
4. Render will give you a public URL anyone can visit.

## Routes

| Method | Path           | Description                        |
| ------ | -------------- | ---------------------------------- |
| GET    | `/`            | Home page with the rankings        |
| GET    | `/submit`      | Submission form                    |
| POST   | `/submit`      | Save a new place to MongoDB        |
| DELETE | `/places/:id`  | Remove a place                     |
