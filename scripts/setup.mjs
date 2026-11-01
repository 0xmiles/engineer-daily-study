// npm run setup: links the Folio skills into Claude Code and Codex, then checks the CLIs.
import { existsSync, lstatSync, mkdirSync, rmSync, rmdirSync, symlinkSync, cpSync, readlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const MINIMUM_NODE_MAJOR = 22
const SKILLS = ['daily-study-question-author', 'daily-study-grader']
// Marks a folder this script copied, so a later run may replace it; any other real folder is the user's and is left alone.
const COPY_MARKER = '.daily-study-copy'
const SKILL_HOMES = [
  { runnerName: 'Claude Code', directory: join(homedir(), '.claude', 'skills') },
  { runnerName: 'Codex', directory: join(homedir(), '.codex', 'skills') },
]

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < MINIMUM_NODE_MAJOR) {
    console.error(`✗ Node.js ${MINIMUM_NODE_MAJOR} 이상이 필요합니다. 현재 버전: ${process.versions.node}`)
    process.exit(1)
  }
  console.log(`✓ Node.js ${process.versions.node}`)
}

function removePreviousInstall(target) {
  if (!existsSync(target) && !isBrokenLink(target)) return true
  if (lstatSync(target).isSymbolicLink()) {
    removeLink(target)
    return true
  }
  if (existsSync(join(target, COPY_MARKER))) {
    rmSync(target, { recursive: true, force: true })
    return true
  }
  console.warn(`  ! ${target} 가 링크가 아닌 실제 폴더입니다. 덮어쓰지 않고 건너뜁니다.`)
  console.warn('    예전 setup 이 만든 복사본이라면 이 폴더를 직접 지운 뒤 npm run setup 을 다시 실행하세요.')
  return false
}

// Removes only the link itself. A recursive delete could follow a Windows junction and wipe the project's skill folder.
function removeLink(target) {
  try {
    unlinkSync(target)
  } catch (error) {
    if (!isWindows) throw error
    rmdirSync(target)
  }
}

function isBrokenLink(path) {
  try {
    readlinkSync(path)
    return true
  } catch {
    return false
  }
}

// macOS uses a symlink; Windows uses a directory junction, which needs no administrator rights. Copy is the last resort.
function linkSkill(source, target) {
  try {
    symlinkSync(source, target, isWindows ? 'junction' : 'dir')
    return 'linked'
  } catch {
    cpSync(source, target, { recursive: true })
    writeFileSync(join(target, COPY_MARKER), 'Copied by npm run setup. Running it again replaces this folder.\n')
    return 'copied'
  }
}

function reportInstall(runnerName, target, installMethod) {
  console.log(`✓ ${runnerName} skill ${installMethod === 'linked' ? '연결' : '복사'}: ${target}`)
  if (installMethod === 'copied') console.log('  (복사본이므로 skill을 수정한 뒤에는 npm run setup 을 다시 실행하세요.)')
}

function installSkill(home, skill) {
  const target = join(home.directory, skill)
  if (!removePreviousInstall(target)) return
  const installMethod = linkSkill(join(projectRoot, 'skills', skill), target)
  reportInstall(home.runnerName, target, installMethod)
}

function installSkills() {
  for (const home of SKILL_HOMES) {
    mkdirSync(home.directory, { recursive: true })
    for (const skill of SKILLS) installSkill(home, skill)
  }
}

function checkRunner(command, runnerName) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', shell: isWindows })
  const isAvailable = result.status === 0
  if (isAvailable) console.log(`✓ ${runnerName}: ${result.stdout.trim()}`)
  else console.log(`- ${runnerName}: 찾을 수 없습니다. 이 실행기를 쓰려면 설치 후 로그인하세요.`)
  return isAvailable
}

console.log('Folio 설정을 시작합니다.\n')
checkNodeVersion()
installSkills()
const hasClaude = checkRunner('claude', 'Claude Code')
const hasCodex = checkRunner('codex', 'Codex')
if (!hasClaude && !hasCodex) {
  console.error('\n✗ Claude Code 와 Codex 중 하나 이상이 필요합니다. docs/install.md 를 참고하세요.')
  process.exit(1)
}
console.log('\n설정이 끝났습니다. npm run dev 로 앱을 실행하고, 설정 화면에서 "연결 테스트"를 눌러 확인하세요.')
