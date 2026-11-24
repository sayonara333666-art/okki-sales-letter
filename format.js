// 统一营销信格式：Dear, + 正文 + Best regards, [Your Name]
// 不管模型写没写联系人姓名/真实发件人姓名，这里都纠回来。

function normalizeGreeting(input) {
  let s = String(input == null ? "" : input).replace(/\r\n/g, "\n").trim();
  if (!s) return "Dear,\n";
  const lines = s.split("\n");
  let idx = lines.findIndex((l) => l.trim());
  if (idx < 0) return "Dear,\n";

  const first = lines[idx].trim();
  const greetingRe =
    /^(dear|hello|hi|estimad[oa]s?|prezad[oa]s?|sehr geehrte[rn]?|cher|chère|caro|cara|gentile|gentili|السادة|السيد|السيدة|kính gửi|merhaba|szanowni|salam)\b/i;

  // 第一行像称呼（或短句+逗号/冒号）就替换成 Dear,
  if (greetingRe.test(first) || (/[,:،]$/.test(first) && first.length < 80)) {
    lines[idx] = "Dear,";
  } else {
    // 没写称呼：补一个
    lines.splice(idx, 0, "Dear,", "");
  }

  return lines.join("\n").replace(/^Dear,[ \t]*\n(?!\n)/, "Dear,\n\n");
}

function normalizeClosing(input) {
  let s = String(input == null ? "" : input).replace(/\r\n/g, "\n").trim();
  const closingRe =
    /\n+(?:best regards|kind regards|sincerely|regards|atentamente|cordialement|mit freundlichen grüßen|atenciosamente|cordiali saluti|مع تحياتي|saygılarımla|z poważaniem|كوردیال)[,\s]*\n?[^\n]{0,100}\s*$/i;
  s = s.replace(closingRe, "").trim();
  return s + "\n\nBest regards,\n[Your Name]";
}

function normalizeEmail(input) {
  return normalizeClosing(normalizeGreeting(input));
}

module.exports = { normalizeEmail, normalizeGreeting, normalizeClosing };
