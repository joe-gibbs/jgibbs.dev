let emailLink = document.getElementById("email");

if (emailLink) {
  emailLink.addEventListener("click", function (e) {
    e.preventDefault();

    let domain = "jgibbs.dev";
    let user = "joe";

    //create new mailto link and click it
    let mailto = document.createElement("a");
    mailto.href = "mailto:" + user + "@" + domain;
    mailto.click();
  });
}

// Also attach to header Contact link(s)
const headerEmailLinks = document.querySelectorAll(".email-link");
headerEmailLinks.forEach((link) => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    let domain = "jgibbs.dev";
    let user = "joe";
    let mailto = document.createElement("a");
    mailto.href = "mailto:" + user + "@" + domain;
    mailto.click();
  });
});
