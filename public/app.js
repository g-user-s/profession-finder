(function () {
  "use strict";

  var dateOptionLabels = {
    tomorrow: "Yarın",
    this_week: "Bu Hafta",
    this_month: "Bu Ay"
  };

  var destinationSelect = document.getElementById("destination");
  var dateButtons = document.querySelectorAll("[data-date-option]");
  var searchButton = document.getElementById("search-button");
  var errorBox = document.getElementById("error-box");
  var resultsSection = document.getElementById("results");
  var resultsHeading = document.getElementById("results-heading");
  var resultsList = document.getElementById("results-list");

  var dateOption = "this_month";
  dateButtons.forEach(function (button) {
    if (button.getAttribute("data-date-option") === dateOption) {
      button.dataset.active = "true";
    }
  });

  function setActiveDateOption(option) {
    dateOption = option;
    dateButtons.forEach(function (button) {
      var isActive = button.getAttribute("data-date-option") === option;
      button.classList.toggle("outline", !isActive);
    });
  }

  dateButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveDateOption(button.getAttribute("data-date-option"));
    });
  });

  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 0
      }).format(price);
    } catch (error) {
      return price + " " + currency;
    }
  }

  function formatDate(dateStr) {
    var date = new Date(dateStr + "T00:00:00");
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function buildFlightLine(result) {
    var wrapper = document.createElement("div");

    var routeLine = document.createElement("p");
    var routeStrong = document.createElement("strong");
    routeStrong.textContent = result.origin + " → " + result.destination;
    routeLine.appendChild(routeStrong);
    routeLine.appendChild(document.createTextNode(" · " + formatDate(result.departureDate)));
    wrapper.appendChild(routeLine);

    var detailLine = document.createElement("p");
    var priceStrong = document.createElement("strong");
    priceStrong.textContent = formatPrice(result.price, result.currency);
    detailLine.appendChild(priceStrong);

    var detailParts = [];
    if (result.airline) detailParts.push(result.airline);
    if (typeof result.stops === "number") {
      detailParts.push(result.stops === 0 ? "Direkt" : result.stops + " aktarma");
    }
    if (result.duration) detailParts.push(result.duration);
    if (detailParts.length > 0) {
      detailLine.appendChild(document.createTextNode(" · " + detailParts.join(" · ")));
    }
    wrapper.appendChild(detailLine);

    if (result.bookingUrl) {
      var linkLine = document.createElement("p");
      var link = document.createElement("a");
      link.href = result.bookingUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Uçuşu Gör";
      linkLine.appendChild(link);
      wrapper.appendChild(linkLine);
    }

    return wrapper;
  }

  function buildDestinationCard(outcome) {
    var article = document.createElement("article");

    var header = document.createElement("header");
    var title = document.createElement("strong");
    title.textContent = outcome.city + ", " + outcome.country;
    header.appendChild(title);
    article.appendChild(header);

    if (outcome.cheapest) {
      article.appendChild(buildFlightLine(outcome.cheapest));

      if (outcome.alternatives && outcome.alternatives.length > 0) {
        var expanded = false;
        var alternativesContainer = document.createElement("div");
        alternativesContainer.hidden = true;

        outcome.alternatives.forEach(function (alternative) {
          alternativesContainer.appendChild(document.createElement("hr"));
          alternativesContainer.appendChild(buildFlightLine(alternative));
        });

        var toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "outline secondary";

        function updateToggleLabel() {
          toggleButton.textContent = expanded
            ? "Alternatifleri gizle"
            : "Alternatif uçuşları gör (" + outcome.alternatives.length + ")";
        }
        updateToggleLabel();

        toggleButton.addEventListener("click", function () {
          expanded = !expanded;
          alternativesContainer.hidden = !expanded;
          updateToggleLabel();
        });

        article.appendChild(toggleButton);
        article.appendChild(alternativesContainer);
      }
    } else {
      var errorParagraph = document.createElement("p");
      errorParagraph.textContent = outcome.error || "Veri alınamadı";
      article.appendChild(errorParagraph);
    }

    return article;
  }

  function renderResults(results) {
    resultsList.innerHTML = "";
    resultsHeading.textContent =
      (dateOptionLabels[dateOption] || "") + " İstanbul'dan en ucuz uçuşlar";

    if (results.length === 0) {
      var empty = document.createElement("p");
      empty.textContent = "Sonuç bulunamadı.";
      resultsList.appendChild(empty);
    } else {
      results.forEach(function (outcome) {
        resultsList.appendChild(buildDestinationCard(outcome));
      });
    }

    resultsSection.hidden = false;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  searchButton.addEventListener("click", function () {
    hideError();
    resultsSection.hidden = true;
    searchButton.setAttribute("aria-busy", "true");
    searchButton.disabled = true;
    searchButton.textContent = "Aranıyor…";

    var params = new URLSearchParams({
      city: destinationSelect.value,
      dateOption: dateOption
    });

    fetch("/api/search?" + params.toString())
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || "Uçuş fiyatları şu anda alınamadı.");
          }
          return data;
        });
      })
      .then(function (data) {
        renderResults(data.results);
      })
      .catch(function (error) {
        showError(
          (error && error.message) ||
            "Uçuş fiyatları şu anda alınamadı. Lütfen birkaç dakika sonra tekrar deneyin."
        );
      })
      .finally(function () {
        searchButton.removeAttribute("aria-busy");
        searchButton.disabled = false;
        searchButton.textContent = "Ucuz Uçuşları Bul";
      });
  });
})();
