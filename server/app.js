const express = require('express');
const path = require('path');
const utils = require('./lib/hashUtils');
const partials = require('express-partials');
const bodyParser = require('body-parser');
const Auth = require('./middleware/auth');
const models = require('./models');

const app = express();

app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));


app.use(require('./middleware/cookieParser'))
app.use(Auth.createSession)

app.get('/',
  (req, res) => {
    res.render('index');
  });

app.get('/create',
  (req, res) => {
    res.render('index');
  });

app.get('/links',
  (req, res, next) => {
    models.Links.getAll()
      .then(links => {
        res.status(200).send(links);
      })
      .error(error => {
        res.status(500).send(error);
      });
  });

app.post('/links',
  (req, res, next) => {
    var url = req.body.url;
    if (!models.Links.isValidUrl(url)) {
      // send back a 404 if link is not valid
      return res.sendStatus(404);
    }

    return models.Links.get({ url })
      .then(link => {
        if (link) {
          throw link;
        }
        return models.Links.getUrlTitle(url);
      })
      .then(title => {
        return models.Links.create({
          url: url,
          title: title,
          baseUrl: req.headers.origin
        });
      })
      .then(results => {
        return models.Links.get({ id: results.insertId });
      })
      .then(link => {
        throw link;
      })
      .error(error => {
        res.status(500).send(error);
      })
      .catch(link => {
        res.status(200).send(link);
      });
  });

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.get('/login', (req, res) => {
  res.render('login');
})

app.get('/signup', (req, res) => {
  res.render('signup')
})

app.get('/logout', (req, res) => {
  return models.Sessions.delete({ hash: req.cookies.shortlyid })
    .then(() => {
      res.clearCookie('shortlyid');
      res.redirect('/login');
    })
    .catch(error => res.status(500).send());
})

app.post('/login', (req, res) => {
  // extract username and password
  const { username, password } = req.body
  // check if the user already exists
  return models.Users.get({ username })
    .then(user => {
      // if no user or the passswords compared with the salt don't match
      if (!user || !models.Users.compare(password, user.password, user.salt)) {
        // if they don't match -> 120
        throw Error('Username and password don\'t match')
      } else {
        // update their session from the req.session and the user.id
        return models.Sessions.update(
          { hash: req.session.hash },
          { userId: user.id }
        )
      }
    })
    // redirect to homepage if successful
    .then(() => res.redirect('/'))
    .error(err => res.status(500).send())
    // redirect to login
    .catch(err => {
      res.redirect('/login')
    })
})

app.post('/signup', (req, res) => {
  // get username and password
  const { username, password } = req.body
  // check to see if the username has been taken
  return models.User.get({ username })
    .then(user => {
      // if it has been throw an error -> 132
      if (user) {
        throw Error('Username taken!')
      } else {
        // otherwise create a new user
        models.Users.create({ username, password })
      }
    })
    .then(results => {
      // then update their session to mark them as logged in (inserting their user id to the existing session)
      return models.Sessions.update(
        { hash: req.session.hash },
        { userId: results.insertId }
      )
    })
    .then(() => res.redirect('/'))
    .error(err => {
      res.status(500).send()
    })
    // redirect them to sign up again
    .catch(err => {
      res.redirect('/signup');
    })
})
/************************************************************/
// Handle the code parameter route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/:code', (req, res, next) => {

  return models.Links.get({ code: req.params.code })
    .tap(link => {

      if (!link) {
        throw new Error('Link does not exist');
      }
      return models.Clicks.create({ linkId: link.id });
    })
    .tap(link => {
      return models.Links.update(link, { visits: link.visits + 1 });
    })
    .then(({ url }) => {
      res.redirect(url);
    })
    .error(error => {
      res.status(500).send(error);
    })
    .catch(() => {
      res.redirect('/');
    });
});

module.exports = app;
