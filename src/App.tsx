import { useRef, useState } from 'react'
import type { Ref } from 'react'
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

interface ContentProps {
  onAddRepositories: () => void
  onChooseTeam: () => void
  chooseTeamRef: Ref<HTMLButtonElement>
}

function Content({ onAddRepositories, onChooseTeam, chooseTeamRef }: ContentProps) {
  const { status, entries, teamChosen } = useDashboard()
  // With no linked repos, or before the team is chosen, the guided setup replaces the Tabs.
  if (status === 'ready' && (entries.length === 0 || !teamChosen)) {
    return (
      <EmptyState
        onAddRepositories={onAddRepositories}
        canChooseTeam={entries.some((e) => e.syncedAt !== null)}
        onChooseTeam={onChooseTeam}
        chooseTeamRef={chooseTeamRef}
      />
    )
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
              <WidgetGrid onOpenSettings={onAddRepositories} />
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
  initialTab: 'repositories' | 'team'
}

// Lives inside DashboardProvider so a change can trigger one reload on close.
function SettingsHost({ open, onClose, fallbackFocus, initialTab, ...deps }: SettingsHostProps) {
  const { reload } = useDashboard()
  return (
    <SettingsDialog
      open={open}
      initialTab={initialTab}
      fallbackFocus={fallbackFocus}
      getTeam={deps.getTeam}
      saveTeam={deps.saveTeam}
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
  const [initialTab, setInitialTab] = useState<'repositories' | 'team'>('repositories')
  const settingsButton = useRef<HTMLButtonElement>(null)
  const chooseTeamButton = useRef<HTMLButtonElement>(null)
  const openSettings = () => {
    setInitialTab('repositories')
    setSettingsOpen(true)
  }
  const openTeamSettings = () => {
    setInitialTab('team')
    setSettingsOpen(true)
  }

  return (
    <div className={styles.app}>
      <Header onOpenSettings={openSettings} settingsRef={settingsButton} />
      <main className={styles.main}>
        <DashboardProvider {...deps}>
          <Toolbar />
          <Content onAddRepositories={openSettings} onChooseTeam={openTeamSettings} chooseTeamRef={chooseTeamButton} />
          <SettingsHost
            {...deps}
            open={settingsOpen}
            initialTab={initialTab}
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
