import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("end stale tables", { minuteUTC: 17 }, internal.maintenance.sweepStale, {});

export default crons;
