exports.formatDate = (dateStr) => {
  const jakartaTimezone = "Asia/Jakarta";
  if (!dateStr) return "-";

  try {
    const formattedDate = new Date(dateStr).toLocaleString("id-ID", {
      timeZone: jakartaTimezone,
      hour12: false,
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return formattedDate;
  } catch {
    return "-";
  }
};
