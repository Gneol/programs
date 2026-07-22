// ============================================================================
// Shared parser utilities: time expressions, env file parsing
// ============================================================================

import fs from 'fs';
import dotenv from 'dotenv';

// ── Helper: parse a time expression into milliseconds until next occurrence ──
export function parseTimeExpression(timeStr: string): number {
    const now = new Date();
    const nowMs = now.getTime();

    // 1. Relative: +N[s|min|h|d]  e.g. "+5min", "+30s", "+2h", "+1d"
    const relativeMatch = timeStr.match(/^\+(\d+)(s|sec|seconds|min|mins|minutes|h|hr|hours|d|days?)$/i);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2].toLowerCase();
        const multipliers: Record<string, number> = {
            s: 1000, sec: 1000, seconds: 1000,
            min: 60000, mins: 60000, minutes: 60000,
            h: 3600000, hr: 3600000, hours: 3600000,
            d: 86400000, days: 86400000,
        };
        const addMs = amount * (multipliers[unit] || 60000);
        return nowMs + addMs;
    }

    // 2. Absolute 12-hour: Hpm or Ham  e.g. "9am", "3pm", "9:40am"
    const absolute12Match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (absolute12Match) {
        let hour = parseInt(absolute12Match[1], 10);
        const minute = absolute12Match[2] ? parseInt(absolute12Match[2], 10) : 0;
        const suffix = absolute12Match[3].toLowerCase();
        if (suffix === 'pm' && hour !== 12) hour += 12;
        if (suffix === 'am' && hour === 12) hour = 0;
        const target = new Date(now);
        target.setHours(hour, minute, 0, 0);
        if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
        return target.getTime();
    }

    // 3. Absolute 24-hour: HH:MM  e.g. "14:30", "18:00"
    const absolute24Match = timeStr.match(/^(\d{2}):(\d{2})$/);
    if (absolute24Match) {
        const hour = parseInt(absolute24Match[1], 10);
        const minute = parseInt(absolute24Match[2], 10);
        const target = new Date(now);
        target.setHours(hour, minute, 0, 0);
        if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
        return target.getTime();
    }

    // 4. Recurring: every:N[s|min|h|d]  e.g. "every:30mins", "every:1h", "every:3s"
    const recurringMatch = timeStr.match(/^every:(\d+)(s|sec|seconds|min|mins|minutes|h|hr|hours|hour|d|days?)$/i);
    if (recurringMatch) {
        const amount = parseInt(recurringMatch[1], 10);
        const unit = recurringMatch[2].toLowerCase();
        const multipliers: Record<string, number> = {
            s: 1000, sec: 1000, seconds: 1000,
            min: 60000, mins: 60000, minutes: 60000,
            h: 3600000, hr: 3600000, hours: 3600000, hour: 3600000,
            d: 86400000, days: 86400000,
        };
        const intervalMs = amount * (multipliers[unit]);

        if(!intervalMs){
            throw new Error(`${timeStr} is unsupported type of time expression`);
        }
        return nowMs + intervalMs;
    }

    // 5. Recurring: every:DayName  e.g. "every:Mon", "every:Monday"
    const dayNames: Record<string, number> = {
        sun: 0, sunday: 0,
        mon: 1, monday: 1,
        tue: 2, tuesday: 2,
        wed: 3, wednesday: 3,
        thu: 4, thursday: 4,
        fri: 5, friday: 5,
        sat: 6, saturday: 6,
    };
    const dayMatch = timeStr.match(/^every:(\w+)$/i);
    if (dayMatch) {
        const dayStr = dayMatch[1].toLowerCase();
        const targetDay = dayNames[dayStr];
        if (targetDay !== undefined) {
            const target = new Date(now);
            const currentDay = target.getDay();
            let daysUntil = targetDay - currentDay;
            if (daysUntil <= 0) daysUntil += 7;
            target.setDate(target.getDate() + daysUntil);
            target.setHours(0, 0, 0, 0);
            return target.getTime();
        }
        // 6. Recurring: every:Nth  e.g. "every:1st", "every:15th"
        const nthMatch = timeStr.match(/^every:(\d{1,2})(st|nd|rd|th)$/i);
        if (nthMatch) {
            const dayOfMonth = parseInt(nthMatch[1], 10);
            const target = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
            if (target.getTime() <= nowMs) target.setMonth(target.getMonth() + 1);
            if (target.getDate() !== dayOfMonth) {
                target.setDate(1);
                target.setMonth(target.getMonth() + 1);
            }
            return target.getTime();
        }
    }

    throw new Error(`Unsupported time expression: "${timeStr}"`);
}

// Parse a .env file into a Record<string, string> (mutates store if provided)
export function parseEnvFile(filePath: string, store: Record<string, string>): Record<string, string> {
    if (!fs.existsSync(filePath)) {
        console.warn(`envFile not found: ${filePath}`);
        return {};
    }
    try {
        const parsed = dotenv.parse(fs.readFileSync(filePath, 'utf-8'));
        store = {
            ...store,
            ...parsed
        };
        return store;
    } catch (err) {
        console.warn(`Failed to parse env file: ${filePath}`, err);
        return {};
    }
}
