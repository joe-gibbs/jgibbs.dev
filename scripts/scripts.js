let emailLink = document.getElementById("email");

emailLink.addEventListener("click", function(e) {
    e.preventDefault();

    let domain = "jgibbs.dev";
    let user = "joe";

    window.location = "mailto:" + user + "@" + domain;
})