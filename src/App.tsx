import styles from './App.module.css'
import DashboardProvider, { useDashboard } from './components/DashboardProvider'
import type { DashboardDeps } from './components/DashboardProvider'
import EmptyState from './components/EmptyState'
import Footer from './components/Footer'
import Header from './components/Header'
import Tabs from './components/Tabs'
import TeamPlaceholder from './components/TeamPlaceholder'
import Toolbar from './components/Toolbar'
import WidgetGrid from './components/WidgetGrid'

function Content() {
  const { status, entries } = useDashboard()
  // AC4: with no linked repos the empty state replaces the Tabs (the Toolbar hides itself).
  if (status === 'ready' && entries.length === 0) return <EmptyState />
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

function App(deps: DashboardDeps) {
  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <DashboardProvider {...deps}>
          <Toolbar />
          <Content />
        </DashboardProvider>
      </main>
      <Footer />
    </div>
  )
}

export default App
