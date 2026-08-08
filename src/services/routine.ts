import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ROUTINE_STATE_KEY = 'slickk.routine.state.v1';
const ROUTINE_CHANNEL_ID = 'learning-routine';

export type RoutineReminder = {
  id: string;
  time: string;
  title: string;
};

export type RoutineState = {
  date: string;
  completed: Record<string, boolean>;
  remindersEnabled: boolean;
  notificationIds: string[];
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState(): RoutineState {
  return {
    date: todayKey(),
    completed: {},
    remindersEnabled: true,
    notificationIds: [],
  };
}

export async function loadRoutineState(): Promise<RoutineState> {
  const stored = await SecureStore.getItemAsync(ROUTINE_STATE_KEY);
  if (!stored) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<RoutineState>;
    return {
      date: todayKey(),
      completed:
        parsed.date === todayKey() && parsed.completed
          ? parsed.completed
          : {},
      remindersEnabled: parsed.remindersEnabled !== false,
      notificationIds: Array.isArray(parsed.notificationIds)
        ? parsed.notificationIds.filter(
            (value): value is string => typeof value === 'string'
          )
        : [],
    };
  } catch {
    return defaultState();
  }
}

export async function saveRoutineState(state: RoutineState) {
  await SecureStore.setItemAsync(
    ROUTINE_STATE_KEY,
    JSON.stringify({ ...state, date: todayKey() })
  );
}

function reminderTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    throw new Error(`Unsupported routine time: ${time}`);
  }

  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') {
    hour += 12;
  }

  const date = new Date();
  date.setHours(hour, Number(match[2]) - 5, 0, 0);
  return { hour: date.getHours(), minute: date.getMinutes() };
}

export async function scheduleRoutineReminders(
  activities: RoutineReminder[],
  previousIds: string[]
) {
  await Promise.all(
    previousIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)
    )
  );

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ROUTINE_CHANNEL_ID, {
      name: 'Learning routine',
      description: 'Five-minute reminders for Slickk learning activities.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#70F7D4',
    });
  }

  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  return Promise.all(
    activities.map(async (activity) => {
      const { hour, minute } = reminderTime(activity.time);
      return Notifications.scheduleNotificationAsync({
        content: {
          title: `${activity.title} starts in 5 minutes`,
          body: 'Open Slickk when you are ready. You can adjust the lesson if you feel tired or need more help.',
          data: { url: '/routine', activityId: activity.id },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: ROUTINE_CHANNEL_ID,
        },
      });
    })
  );
}

export async function cancelRoutineReminders(ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)
    )
  );
}
