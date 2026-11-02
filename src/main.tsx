/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './LandingPage'
import { installShareSync } from './lib/share'

installShareSync()

const isAppRoute = /^\/app(?:\/|$)/.test(window.location.pathname)
const root = createRoot(document.getElementById('root')!)

if (isAppRoute) {
  void import('./DashboardRoot').then(({ default: DashboardRoot }) => {
    root.render(<StrictMode><DashboardRoot /></StrictMode>)
  })
} else {
  root.render(<StrictMode><LandingPage /></StrictMode>)
}
