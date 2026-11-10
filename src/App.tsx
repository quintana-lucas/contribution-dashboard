import { useRef, useState } from 'react'
import styles from './App.module.css'
import DashboardProvider, { useDashboard } from './components/DashboardProvider'
import type { DashboardDeps } from './components/DashboardProvider'
import EmptyState from './components/EmptyState'
import Footer from './components/Footer'
import Header from './components/Header'
import SettingsDialog from './components/SettingsDialog'
import Tabs from './components/Tabs'
import TeamPlaceholder from './components/TeamPlaceholder'
import Toolbar from './components/Toolbar'
import WidgetGrid from './components/WidgetGrid'

function Content({ onAddRepositories }: { onAddRepositories: () => void }) {
  const { status, entries } = useDashboard()
  // With no linked repos the empty state replaces the Tabs (the Toolbar hides itself).
  if (status === 'ready' && entries.length === 0) {
    return <EmptyState onAddRepositories={onAddRepositories} />
  }
  return (
    <Tabs
      label="Dashboard views"
      tabs={[
        {
          key: 'overview',
          label: 'Overview',
          content: (
            <>
              <p className={styles.intro}>
                Widgets for GitHub team collaboration will appear here.
              </p>
              <WidgetGrid />
            </>
          ),
        },
        { key: 'team', label: 'Team', content: <TeamPlaceholder /> },
      ]}
    />
  )
}

interface SettingsHostProps extends DashboardDeps {
  open: boolean
  onClose: () => void
  fallbackFocus: () => HTMLElement | null
}

// Lives inside DashboardProvider so a change can trigger one reload on close.
function SettingsHost({ open, onClose, fallbackFocus, ...deps }: SettingsHostProps) {
  const { reload } = useDashboard()
  return (
    <SettingsDialog
      open={open}
      fallbackFocus={fallbackFocus}
      listRepos={deps.listRepos}
      addRepo={deps.addRepo}
      removeRepo={deps.removeRepo}
      syncRepo={deps.syncRepo}
      getTokenStatus={deps.getTokenStatus}
      now={deps.now}
      onClose={(changed) => {
        onClose()
        if (changed) reload()
      }}
    />
  )
}

function App(deps: DashboardDeps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className={styles.app}>
      <Header onOpenSettings={openSettings} settingsRef={settingsButton} />
      <main className={styles.main}>
        <DashboardProvider {...deps}>
          <Toolbar />
          <Content onAddRepositories={openSettings} />
          <SettingsHost
            {...deps}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            fallbackFocus={() => settingsButton.current}
          />
        </DashboardProvider>
      </main>
      <Footer />
    </div>
  )
}

export default App
