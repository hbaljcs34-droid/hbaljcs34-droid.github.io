/* Outil de sélection — Le Bon Appareil
 *
 * Principe : on ne classe pas des appareils, on écarte ceux qui ne rentrent pas.
 * Chaque guide embarque un bloc <div data-outil> qui décrit :
 *   - des champs de saisie (nombre ou liste) avec leur sens de comparaison
 *   - la liste des modèles relevés et leurs valeurs réelles
 * Aucune donnée n'est inventée par le script : il ne fait que filtrer ce que le
 * blob JSON contient, et il n'affiche rien si une valeur est absente.
 *
 * Sens des champs :
 *   "max" : l'appareil doit avoir une valeur <= à ce que l'utilisateur saisit
 *           (ex. largeur de niche disponible : il faut que le four rentre)
 *   "min" : l'appareil doit avoir une valeur >= à ce que l'utilisateur saisit
 *           (ex. budget : on veut au moins ce prix ; puissance : au moins X W)
 */
(function () {
  "use strict";

  function lireJSON(el) {
    // Les données sont dans un <script type="application/json"> enfant : aucun
    // risque de collision avec les guillemets ou les apostrophes du contenu.
    var bloc = el.querySelector('script[type="application/json"]');
    var brut = bloc ? bloc.textContent : el.getAttribute("data-outil");
    if (!brut) return null;
    try {
      return JSON.parse(brut);
    } catch (e) {
      if (window.console) console.error("outil : données illisibles", e);
      return null;
    }
  }

  function normaliser(txt) {
    return (txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function compatible(item, champs, valeurs) {
    for (var i = 0; i < champs.length; i++) {
      var c = champs[i];
      var saisi = valeurs[c.id];
      if (saisi === null || saisi === undefined || saisi === "") continue;
      var v = item.criteres ? item.criteres[c.id] : undefined;
      if (v === undefined || v === null) continue; // donnée absente : on ne juge pas
      if (c.type === "nombre") {
        saisi = parseFloat(saisi);
        if (isNaN(saisi)) continue;
        if (c.sens === "max" && v > saisi) return false;
        if (c.sens === "min" && v < saisi) return false;
      } else if (c.type === "liste") {
        if (normaliser(v) !== normaliser(saisi)) return false;
      }
    }
    return true;
  }

  function euros(n) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    }).format(n);
  }

  function carte(item, champs, valeurs) {
    var marges = [];
    champs.forEach(function (c) {
      // La marge n'est affichée que si le champ le demande explicitement (marge:true) :
      // seules les contraintes de place ou de capacité s'y prêtent.
      if (c.marge !== true) return;
      var saisi = valeurs[c.id];
      var v = item.criteres ? item.criteres[c.id] : undefined;
      if (saisi === null || saisi === undefined || saisi === "" || v === undefined) return;
      if (c.type !== "nombre") return;
      var ecart = c.sens === "max" ? parseFloat(saisi) - v : v - parseFloat(saisi);
      if (ecart > 0) {
        marges.push((c.margeTexte || "marge") + " : " + (Math.round(ecart * 10) / 10) + " " + (c.unite || ""));
      }
    });

    var atouts = (item.atouts || []).slice(0, 3)
      .map(function (a) { return "<li>" + a + "</li>"; }).join("");

    return '<article class="resultat-carte">' +
      '<div class="resultat-carte__tete">' +
        '<h3>' + item.marque + " " + item.modele + "</h3>" +
        (item.prix ? '<p class="prix">' + euros(item.prix) + "</p>" : "") +
      "</div>" +
      (atouts ? '<ul class="liste-propre">' + atouts + "</ul>" : "") +
      (marges.length ? '<p class="resultat-carte__marge">' + marges.join(" · ") + "</p>" : "") +
      (item.reserve ? '<p class="resultat-carte__reserve">' + item.reserve + "</p>" : "") +
      "</article>";
  }

  function rendre(el, donnees, valeurs) {
    var ok = donnees.items.filter(function (it) {
      return compatible(it, donnees.champs, valeurs);
    });
    // Tri : par "tri" si fourni (ex. coût horaire), sinon par prix croissant.
    ok.sort(function (a, b) {
      var va = a.tri !== undefined ? a.tri : (a.prix || 0);
      var vb = b.tri !== undefined ? b.tri : (b.prix || 0);
      return va - vb;
    });

    var zone = el.querySelector(".resultat");
    var total = donnees.items.length;
    var ordre = donnees.triLibelle || "du moins cher au plus cher";

    if (!ok.length) {
      zone.innerHTML = '<p class="resultat-vide">Aucun des ' + total +
        " modèles relevés ne correspond à ces contraintes. C'est une information en soi : " +
        "il faut soit élargir une contrainte, soit changer de modèle de meuble.</p>";
      return;
    }

    var entete = '<p class="resultat-compte"><strong>' + ok.length + " modèle" +
      (ok.length > 1 ? "s" : "") + "</strong> sur " + total +
      " relevés passe" + (ok.length > 1 ? "nt" : "") + " ces contraintes, " + ordre + ".</p>";
    zone.innerHTML = entete + '<div class="resultats-grille">' +
      ok.map(function (it) { return carte(it, donnees.champs, valeurs); }).join("") + "</div>";
  }

  function init(el) {
    var donnees = lireJSON(el);
    // Pas de données exploitables : on laisse le bloc tel quel, on ne masque jamais.
    if (!donnees || !donnees.items || !donnees.items.length) return;
    var valeurs = {};
    var champsHTML = donnees.champs.map(function (c, i) {
      var id = "ch-" + c.id;
      var input;
      if (c.type === "liste") {
        input = '<select id="' + id + '" data-champ="' + c.id + '"><option value="">' +
          (c.tout || "Peu importe") + "</option>" +
          (c.options || []).map(function (o) {
            return '<option value="' + o + '">' + o + "</option>";
          }).join("") + "</select>";
      } else {
        input = '<input id="' + id + '" data-champ="' + c.id + '" type="number" inputmode="decimal"' +
          (c.min !== undefined ? ' min="' + c.min + '"' : "") +
          (c.max !== undefined ? ' max="' + c.max + '"' : "") +
          (c.pas ? ' step="' + c.pas + '"' : "") +
          (c.exemple ? ' placeholder="' + c.exemple + '"' : "") + ">";
      }
      return '<label class="champ"><span class="champ__label">' + c.label + "</span>" +
        input +
        (c.unite ? '<span class="champ__unite">' + c.unite + "</span>" : "") +
        (c.aide ? '<span class="champ__aide">' + c.aide + "</span>" : "") +
        "</label>";
    }).join("");

    el.querySelector(".selecteur__champs").innerHTML = champsHTML;
    var params = new URLSearchParams(window.location.search);
    el.querySelectorAll("[data-champ]").forEach(function (input) {
      var id = input.getAttribute("data-champ");
      // valeurs pré-remplies par l'URL : permet de partager un lien avec ses contraintes
      if (params.has(id)) input.value = params.get(id);
      valeurs[id] = input.value;
      input.addEventListener("input", function () {
        valeurs[id] = input.value;
        rendre(el, donnees, valeurs);
      });
    });

    var reinit = el.querySelector("[data-reinit]");
    if (reinit) {
      reinit.addEventListener("click", function () {
        el.querySelectorAll("[data-champ]").forEach(function (input) {
          input.value = "";
          valeurs[input.getAttribute("data-champ")] = "";
        });
        rendre(el, donnees, valeurs);
      });
    }

    rendre(el, donnees, valeurs);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".selecteur").forEach(init);
  });
})();
