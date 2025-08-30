document.addEventListener("DOMContentLoaded", function () {
  const domain = "jgibbs.dev";
  const user = "joe";
  const mailtoHref = "mailto:" + user + "@" + domain;

  const emailButton = document.getElementById("email");
  if (emailButton) {
    emailButton.setAttribute("href", mailtoHref);
    emailButton.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = mailtoHref;
    });
  }

  const headerEmailLinks = document.querySelectorAll(".email-link");
  headerEmailLinks.forEach((link) => {
    link.setAttribute("href", mailtoHref);
    link.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = mailtoHref;
    });
  });
});
