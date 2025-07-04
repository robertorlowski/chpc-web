import app from './middleware/app'
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`App listening at https://chpc-web.onrender.com:${port}`)
})
