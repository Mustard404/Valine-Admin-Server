"use strict";
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
var request = require("request");
let config = {
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

if (process.env.SMTP_SERVICE != null) {
  config.service = process.env.SMTP_SERVICE;
} else {
  config.host = process.env.SMTP_HOST;
  config.port = parseInt(process.env.SMTP_PORT);
  config.secure = process.env.SMTP_SECURE === "false" ? false : true;
}

const transporter = nodemailer.createTransport(config);
let templateName = process.env.TEMPLATE_NAME
  ? process.env.TEMPLATE_NAME
  : "default";
let noticeTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "notice.ejs"),
    "utf8"
  )
);
let sendTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "send.ejs"),
    "utf8"
  )
);

transporter.verify(function(error, success) {
  if (error) {
    console.log("SMTP邮箱配置异常：", error);
  }
  if (success) {
    console.log("SMTP邮箱配置正常！");
  }
});

// 提醒站长
exports.notice = comment => {
  // 站长自己发的评论不需要通知
  if (
    comment.get("mail") === process.env.TO_EMAIL ||
    comment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }
  let describe =
    "### 您的网站\r\n" +
    process.env.SITE_NAME +
    "\r\n ### 评论内容" +
    "\r\n > " +
    comment.get("comment") +
    "\r\n" +
    "原文地址 👉 " +
    process.env.SITE_URL +
    comment.get("url") +
    "\r\n ### 评论人\r\n" +
    comment.get("nick") +
    "(" +
    comment.get("mail") +
    ")";
  request.post(
    {
      url: "https://sc.ftqq.com/" + process.env.SCKEY + ".send",
      form: { text: process.env.SITE_NAME + "来评论啦！", desp: describe }
    },
    function(error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log("server酱发送成功！");
      }
    }
  );
  let comment_id = process.env.COMMENT ? process.env.COMMENT : "#comment";
  let emailSubject = "咚！「" + process.env.SITE_NAME + "」上有新评论了";
  let emailContent = noticeTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    name: comment.get("nick"),
    text: comment.get("comment"),
    url: process.env.SITE_URL + comment.get("url") + comment_id,
    mail: comment.get("mail")
  });

  let mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
    to: process.env.TO_EMAIL ? process.env.TO_EMAIL : process.env.SMTP_USER,
    subject: emailSubject,
    html: emailContent
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log("收到一条评论, 已提醒站长");
    comment.set("isNotified", true);
    comment.save();
  });
};

// 发送邮件通知他人
exports.send = (currentComment, parentComment) => {
  // 站长被 @ 不需要提醒
  if (
    parentComment.get("mail") === process.env.TO_EMAIL ||
    parentComment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }
  let emailSubject = "叮咚！「" + process.env.SITE_NAME + "」上有人@了你";
  let comment_id = process.env.COMMENT ? process.env.COMMENT : "#comment";
  let emailContent = sendTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    pname: parentComment.get("nick"),
    ptext: parentComment.get("comment"),
    name: currentComment.get("nick"),
    text: currentComment.get("comment"),
    url: process.env.SITE_URL + currentComment.get("url") + comment_id
  });
  let mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
    to: parentComment.get("mail"),
    subject: emailSubject,
    html: emailContent
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log(
      currentComment.get("nick") +
        " @了" +
        parentComment.get("nick") +
        ", 已通知."
    );
    currentComment.set("isNotified", true);
    currentComment.save();
  });
};
