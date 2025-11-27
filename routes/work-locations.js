const express = require("express");
const router = express.Router();
const WorkLocation = require("../models/WorkLocation");
const Holiday = require("../models/Holiday");
const { getMonthDateRange, formatDate } = require("../utils/dateUtils");

const isWithinAllowedWindow = (dateStr) => {
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) {
    return null;
  }

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const nextMonth2 = nextMonth === 12 ? 1 : nextMonth + 1;
  const nextYear2 = nextMonth === 12 ? nextYear + 1 : nextYear;

  const { startDate: prevStart } = getMonthDateRange(prevYear, prevMonth);
  const { endDate: next2End } = getMonthDateRange(nextYear2, nextMonth2);

  const start = new Date(prevStart);
  const end = new Date(next2End);

  return target >= start && target <= end;
};

// Upsert work location for a specific date (previous, current or next 2 months)
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { work_date, is_onsite } = req.body;

    if (!work_date) {
      return res.status(400).json({ error: "Missing work_date" });
    }

    if (is_onsite === undefined || is_onsite === null) {
      return res.status(400).json({ error: "Missing is_onsite value" });
    }

    const allowed = isWithinAllowedWindow(work_date);
    if (allowed === null) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    if (!allowed) {
      return res
        .status(400)
        .json({ error: "Date must be within allowed range (previous month to 2 months ahead)" });
    }

    // Keep legacy behavior: weekends and holidays default to remote
    const normalizedDate = formatDate(work_date);
    const dateObj = new Date(normalizedDate);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = await Holiday.isHoliday(userId, normalizedDate);
    const isOnsiteValue =
      isWeekend || isHoliday
        ? false
        : WorkLocation.normalizeIsOnsite(is_onsite);

    const location = await WorkLocation.createOrUpdate({
      user_id: userId,
      work_date: normalizedDate,
      is_onsite: isOnsiteValue,
    });

    res.json({
      success: true,
      data: {
        work_date: formatDate(location.work_date),
        is_onsite: location.is_onsite,
      },
    });
  } catch (error) {
    console.error("Error updating work location:", error);
    res.status(500).json({ error: "Failed to update work location" });
  }
});

// Clear planned location for a specific date
router.delete("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { work_date } = req.body;

    if (!work_date) {
      return res.status(400).json({ error: "Missing work_date" });
    }

    const allowed = isWithinAllowedWindow(work_date);
    if (allowed === null) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    if (!allowed) {
      return res
        .status(400)
        .json({ error: "Date must be within allowed range (previous month to 2 months ahead)" });
    }

    const removed = await WorkLocation.deleteByUserAndDate(
      userId,
      formatDate(work_date)
    );

    res.json({ success: true, removed });
  } catch (error) {
    console.error("Error clearing work location:", error);
    res.status(500).json({ error: "Failed to clear work location" });
  }
});

module.exports = router;
