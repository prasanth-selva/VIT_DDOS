const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const metricsRoutes = require('../metrics/routes');
const dashboardRoutes = require('../dashboard-api/routes');

function createApp({ staticDir, dashboardStatic }) {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false
  }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cors());
  app.use(morgan('combined'));
  app.use(express.json());

  app.use('/metrics', metricsRoutes);
  app.use(dashboardRoutes);
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  if (dashboardStatic) {
    app.use(express.static(staticDir));
    app.get('/', (req, res) => res.sendFile(`${staticDir}/index.html`));
  }

  return app;
}

module.exports = createApp;
