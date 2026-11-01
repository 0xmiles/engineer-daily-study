import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENTS, type DailyStudyApi, type InvokableApi } from '@shared/api'

const INVOKABLE_METHODS = [
  'getSettings', 'saveSettings', 'locateRunners', 'testRunner', 'chooseDataDirectory',
  'getToday', 'prepareToday', 'startDailyAttempt', 'retryDailyItem', 'requestPractice',
  'listQuestions', 'getQuestion', 'createManualQuestion', 'generateQuestions', 'setReviewStatus', 'deleteQuestion',
  'startAttempt', 'getAttempt', 'saveDraft', 'submitAttempt', 'retryGrading', 'listHistory', 'getStats',
  'listTopics', 'setTopicEnabled', 'addCustomTopic', 'updateCustomTopic', 'deleteCustomTopic',
  'requestHint', 'postponeAttempt', 'listPostponed', 'startRetry',
  'requestFollowUps', 'answerFollowUp', 'retryFollowUpEvaluation', 'askInquiry', 'retryInquiry',
  'listStudyNotes', 'updateStudyNote', 'getStreak',
  'listInterviews', 'getInterview', 'startTimedInterview', 'retryInterviewPreparation', 'beginTimedItem', 'submitTimedItem',
  'startConversationInterview', 'answerConversation', 'retryConversationTurn', 'finishConversation', 'retryInterviewReport', 'abandonInterview',
  'listFeedback', 'addQuestionFeedback', 'addAuthoringFeedback', 'setFeedbackActive',
  'listJobs', 'cancelJob',
] as const satisfies readonly (keyof InvokableApi)[]

// Fails to compile when a method is added to DailyStudyApi but not to INVOKABLE_METHODS.
type MissingMethods = Exclude<keyof InvokableApi, (typeof INVOKABLE_METHODS)[number]>
const everyMethodIsInvokable: [MissingMethods] extends [never] ? true : MissingMethods = true

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: Payload): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const invokers = Object.fromEntries(
  INVOKABLE_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(`api:${method}`, ...args)]),
) as unknown as InvokableApi

const api: DailyStudyApi = {
  ...invokers,
  onJobsChanged: (listener) => subscribe(IPC_EVENTS.jobsChanged, listener),
  onDataChanged: (listener) => subscribe(IPC_EVENTS.dataChanged, listener),
  onNavigate: (listener) => subscribe(IPC_EVENTS.navigate, listener),
}

void everyMethodIsInvokable
contextBridge.exposeInMainWorld('dailyStudy', api)
